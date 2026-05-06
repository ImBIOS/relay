#!/usr/bin/env bun
//===============================================================================
// Session End Hook - Notifications + Commit Prompt
// Sends desktop notifications and prompts to commit uncommitted changes
//===============================================================================

import { Flags } from "@oclif/core";
import { Box, Text } from "ink";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { BaseCommand } from "../../oclif/base";
import { Info, Section, Warning } from "../../ui/index";

type CommitMode = "critical" | "normal" | "none";

interface StopOptions {
  silent: boolean;
  verbose: boolean;
  noCommit: boolean;
  commitMode: CommitMode;
}

interface TranscriptEntry {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
  message?: {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }>;
  };
}

function extractMessageFromTranscript(transcriptPath: string, maxLength = 100): string {
  if (!existsSync(transcriptPath)) {
    return "Task completed";
  }

  try {
    const content = fs.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry: TranscriptEntry = JSON.parse(line);

        // Handle different transcript formats
        let role = "";
        let content: unknown = null;

        // Try new format (entry.message)
        if (entry.message && typeof entry.message === "object") {
          role = entry.message.role || "";
          content = entry.message.content;
        }
        // Try old format (entry.role)
        else if (entry.role) {
          role = entry.role;
          content = entry.content;
        }

        if (role === "user" && content !== null) {
          let message = "";

          if (Array.isArray(content)) {
            const textParts: string[] = [];
            for (const block of content) {
              if (block && typeof block === "object") {
                const text = block.text || "";
                if (text) textParts.push(text);
              } else if (typeof block === "string") {
                textParts.push(block);
              }
            }
            message = textParts.join(" ");
          } else if (typeof content === "string") {
            message = content;
          } else if (content !== null) {
            message = String(content);
          }

          if (message.length > maxLength) {
            message = message.slice(0, maxLength - 3) + "...";
          }
          return message;
        }
      } catch {}
    }
  } catch {
    // Ignore errors reading transcript
  }

  return "Task completed";
}

function sendNotification(title: string, message: string): void {
  // Try notify-send (Linux)
  if (existsSync("/usr/bin/notify-send")) {
    spawn("/usr/bin/notify-send", [title, message, "-i", "dialog-information"], {
      stdio: "ignore",
      detached: true,
    });
    return;
  }

  // Try osascript (macOS)
  if (existsSync("/usr/bin/osascript")) {
    spawn("/usr/bin/osascript", ["-e", `display notification "${message}" with title "${title}"`], {
      stdio: "ignore",
      detached: true,
    });
    return;
  }

  // TODO: Fallback, write to console only in verbose mode
}

async function hasUncommittedChanges(): Promise<{
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}> {
  const gitDir = path.join(process.cwd(), ".git");
  if (!existsSync(gitDir)) {
    return { staged: false, unstaged: false, untracked: false };
  }

  try {
    // Check for staged changes
    const statusResult = spawn("git", ["status", "--porcelain"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let statusOutput = "";
    statusResult.stdout.on("data", (data) => (statusOutput += data.toString()));

    return new Promise((resolve) => {
      statusResult.on("close", () => {
        const lines = statusOutput.trim().split("\n").filter(Boolean);
        let staged = false;
        let unstaged = false;
        let untracked = false;

        for (const line of lines) {
          const status = line.slice(0, 2);
          const firstChar = status[0];
          const secondChar = status[1];

          if (firstChar === "A" || firstChar === "M" || secondChar === "M") {
            staged = true;
          }
          if (firstChar === " " || secondChar === " ") {
            unstaged = true;
          }
          if (firstChar === "?" || secondChar === "?") {
            untracked = true;
          }
        }

        resolve({ staged, unstaged, untracked });
      });
      statusResult.on("error", () => {
        resolve({ staged: false, unstaged: false, untracked: false });
      });
    });
  } catch {
    return { staged: false, unstaged: false, untracked: false };
  }
}

function runGitCommand(args: string[]): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    proc.stdout.on("data", (data) => (output += data.toString()));
    proc.stderr.on("data", (data) => (output += data.toString()));
    proc.on("close", (code) => {
      resolve({ success: code === 0, output });
    });
    proc.on("error", () => {
      resolve({ success: false, output: "" });
    });
  });
}

async function generateConventionalCommit(message: string): Promise<string> {
  // Get diff stat to help generate a good commit message
  const diffResult = await runGitCommand(["diff", "--cached", "--stat"]);
  const stagedFiles = diffResult.success ? diffResult.output : "";

  // Get a short diff for more context (limit to avoid huge payloads)
  const shortDiff = await runGitCommand(["diff", "--cached", "--no-color", "-U1"]);
  const diffContent = shortDiff.success ? shortDiff.output.slice(0, 4000) : "";

  return new Promise<string>((resolve, reject) => {
    const prompt = `Generate a conventional commit message for this change.

Message from user: ${message}

Staged files:
${stagedFiles || "No staged files"}

Diff (truncated):
${diffContent || "No diff available"}

Follow conventional commits format (feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert).
Include a short description (under 72 characters). Be specific about what changed.
Return ONLY the commit message, no explanation or formatting.`;

    const proc = spawn("claude", ["-p", "--output-format", "text", "--model", "MiniMax-M2.7"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Prevent recursive hook invocations: child claude -p inherits this,
        // and the Stop hook exits early when it sees it.
        RELAY_IN_HOOK: "1",
      },
    });

    let output = "";
    proc.stdout.on("data", (data) => (output += data.toString()));
    proc.stderr.on("data", (data) => (output += data.toString()));

    proc.on("close", (code) => {
      if (code === 0 && output.trim()) {
        // Extract first line of commit message
        const commitMsg = output.trim().split("\n")[0]!;
        resolve(commitMsg);
      } else {
        reject(
          new Error(
            `[relay] Claude CLI failed to generate commit message (exit ${code}): ${output.trim().slice(0, 200)}`,
          ),
        );
      }
    });

    proc.on("error", (err) =>
      reject(new Error(`[relay] Failed to spawn Claude CLI for commit message generation: ${err.message}`)),
    );

    proc.stdin?.write(prompt);
    proc.stdin?.end();
  });
}

export default class HooksStop extends BaseCommand<typeof HooksStop> {
  static description = "Session end hook - notifications and auto-commit";

  static examples = ["<%= config.bin %> hooks stop", "relay hooks stop --silent"];

  static flags = {
    silent: Flags.boolean({
      description: "Run silently without output",
    }),
    verbose: Flags.boolean({
      description: "Show detailed output",
    }),
    "no-commit": Flags.boolean({
      description: "Skip auto-commit",
    }),
    mode: Flags.string({
      description:
        "Commit mode: none (default, uses --no-verify), normal (3 attempts, last with --no-verify), critical (infinite retry until success)",
      options: ["none", "normal", "critical"],
      default: "none",
    }),
  };

  async run(): Promise<void> {
    // Guard against recursive hook invocations.
    // When this hook spawns `claude -p` for commit message generation,
    // the child process inherits RELAY_IN_HOOK=1 — so its Stop hook exits immediately.
    if (process.env.RELAY_IN_HOOK === "1") {
      return;
    }

    const { flags } = await this.parse(HooksStop);
    const options: StopOptions = {
      silent: flags.silent ?? false,
      verbose: flags.verbose ?? false,
      noCommit: flags["no-commit"] ?? false,
      commitMode: (flags.mode ?? "none") as CommitMode,
    };

    // Get transcript path from stdin
    let transcriptPath = "";
    try {
      const stdin = fs.readFileSync("/dev/stdin", "utf-8");
      const input = JSON.parse(stdin);
      transcriptPath = input.transcript_path || "";
    } catch {
      // Not JSON or no stdin
    }

    // Extract message from transcript
    const message = extractMessageFromTranscript(transcriptPath, 100);

    // Check for uncommitted changes
    const changes = await hasUncommittedChanges();
    const hasChanges = changes.staged || changes.unstaged || changes.untracked;

    // Auto-commit if there are changes (unless --no-commit flag)
    if (hasChanges && !options.noCommit) {
      if (options.verbose) {
        console.log("\n📝 Auto-committing changes...");
      }

      // Stage all changes (tracked + untracked, but NOT deleted files)
      await runGitCommand(["add", "-u"]);

      // Add untracked files explicitly
      if (changes.untracked) {
        await runGitCommand(["add", "."]);
      }

      // Generate conventional commit message using Claude Code CLI
      if (options.verbose) {
        console.log("\n🤖 Generating conventional commit message...");
      }

      let commitMessage: string;
      try {
        commitMessage = await generateConventionalCommit(message);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(msg);
        console.error("Uncommitted changes remain — commit manually");
        return;
      }

      if (options.verbose) {
        console.log(`📝 Commit message: ${commitMessage}`);
      }

      // Try to commit with pre-commit checks
      let commitSuccess = false;
      let attempts = 0;
      const maxNormalAttempts = 3;

      // none: single attempt with --no-verify (skip pre-commit entirely)
      // normal: up to 3 attempts, last one uses --no-verify
      // critical: infinite retry with formatter until success
      while (!commitSuccess) {
        attempts++;

        const useNoVerify =
          options.commitMode === "none" ||
          (options.commitMode === "normal" && attempts >= maxNormalAttempts);

        const commitArgs = ["commit", "-m", commitMessage, ...(useNoVerify ? ["--no-verify"] : [])];

        if (options.verbose) {
          console.log(`🔧 Commit attempt ${attempts}${useNoVerify ? " (--no-verify)" : ""}...`);
        }

        const commitResult = await runGitCommand(commitArgs);

        if (commitResult.success) {
          commitSuccess = true;
          if (!options.silent) {
            console.log(`✅ Changes committed${useNoVerify ? " (with --no-verify)" : ""}`);
          }

          // Auto-push after commit
          const pushResult = await runGitCommand(["push"]);
          if (pushResult.success) {
            if (!options.silent) {
              console.log("✅ Pushed to remote");
            }
          } else if (options.verbose) {
            console.log(`⚠️  Push failed: ${pushResult.output.split("\n")[0]}`);
          }
        } else {
          // none mode: single attempt, already used --no-verify, give up
          // normal mode: retry up to maxNormalAttempts
          // critical mode: always retry
          const shouldRetry =
            options.commitMode === "critical" ||
            (options.commitMode === "normal" && attempts < maxNormalAttempts);

          if (!shouldRetry) {
            break;
          }

          if (options.verbose) {
            console.log("⚠️  Commit failed, running formatter and retrying...");
            console.log(`   Error: ${commitResult.output.split("\n")[0]}`);
          }

          // Run formatter to fix issues
          await new Promise<void>((resolve) => {
            spawn("bun", ["x", "ultracite", "fix"], {
              stdio: options.verbose ? "inherit" : "ignore",
              shell: true,
            }).on("close", () => resolve());
          });

          // Re-stage files after formatting
          await runGitCommand(["add", "-u", "."]);
        }
      }

      if (!commitSuccess) {
        console.error("❌ Failed to commit after multiple attempts");
        console.error("Please commit manually with: git add -u && git commit");
      }
    }

    // Send notification after commit and push
    if (!options.silent || options.verbose) {
      sendNotification("Claude Code", message);
    }

    if (options.silent) {
      return;
    }

    // In non-silent mode, show summary
    await this.renderApp(
      <Section title="Session Complete">
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text>{message}</Text>
          </Box>

          {hasChanges && options.noCommit && (
            <Box marginTop={1}>
              <Warning>You have uncommitted changes. Use --no-commit to skip auto-commit.</Warning>
            </Box>
          )}

          {options.verbose && (
            <Box flexDirection="column" marginTop={1}>
              <Info>Git status:</Info>
              <Box marginLeft={2}>
                <Text>
                  Staged: {changes.staged ? "Yes" : "No"} | Unstaged:{" "}
                  {changes.unstaged ? "Yes" : "No"} | Untracked: {changes.untracked ? "Yes" : "No"}
                </Text>
              </Box>
            </Box>
          )}
        </Box>
      </Section>,
    );
  }
}
