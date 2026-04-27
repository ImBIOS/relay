#!/usr/bin/env bun
//===============================================================================
// ForgeCode Session End Hook - Auto-commit
// Commits uncommitted changes after a ForgeCode session ends.
// Designed to be called from a shell wrapper function after `forge` exits.
//===============================================================================

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { Flags } from "@oclif/core";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Info, Section, Warning } from "../../ui/index";

type CommitMode = "critical" | "normal" | "none";

interface ForgeStopOptions {
  silent: boolean;
  verbose: boolean;
  noCommit: boolean;
  commitMode: CommitMode;
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

async function generateConventionalCommit(): Promise<string | null> {
  // Get diff stat to help generate a good commit message
  const diffResult = await runGitCommand(["diff", "--cached", "--stat"]);
  const stagedFiles = diffResult.success ? diffResult.output : "";

  // Get a short diff for more context (limit to avoid huge payloads)
  const shortDiff = await runGitCommand(["diff", "--cached", "--no-color", "-U1"]);
  const diffContent = shortDiff.success ? shortDiff.output.slice(0, 4000) : "";

  // Try forge first, then fall back to claude
  const editors = ["forge", "claude"];

  for (const editor of editors) {
    try {
      // Check if the editor CLI is available
      const whichResult = await new Promise<boolean>((resolve) => {
        spawn("which", [editor], { stdio: "ignore" }).on("close", (code) => {
          resolve(code === 0);
        });
      });

      if (!whichResult) continue;

      const commitMessage = await new Promise<string | null>((resolve) => {
        const prompt = `Generate a conventional commit message for this change.

Staged files:
${stagedFiles || "No staged files"}

Diff (truncated):
${diffContent || "No diff available"}

Follow conventional commits format (feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert).
Include a short description (under 72 characters). Be specific about what changed.
Return ONLY the commit message, no explanation or formatting.`;

        const proc = spawn(editor, ["-p", "--output-format", "text"], {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            // Prevent recursive hook invocations
            RELAY_IN_HOOK: "1",
          },
        });

        let output = "";
        proc.stdout.on("data", (data) => (output += data.toString()));
        proc.stderr.on("data", (data) => (output += data.toString()));

        proc.on("close", (code) => {
          if (code === 0 && output.trim()) {
            const commitMsg = output.trim().split("\n")[0];
            resolve(commitMsg ?? null);
          } else {
            resolve(null);
          }
        });

        proc.on("error", () => resolve(null));

        proc.stdin?.write(prompt);
        proc.stdin?.end();
      });

      if (commitMessage) return commitMessage;
    } catch {
      continue;
    }
  }

  return null;
}

export default class HooksForgeStop extends BaseCommand<typeof HooksForgeStop> {
  static description = "ForgeCode session end hook - auto-commit after forge exits";

  static examples = [
    "<%= config.bin %> hooks forge-stop",
    "relay hooks forge-stop --silent",
    "relay hooks forge-stop --mode critical",
  ];

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
    if (process.env.RELAY_IN_HOOK === "1") {
      return;
    }

    const { flags } = await this.parse(HooksForgeStop);
    const options: ForgeStopOptions = {
      silent: flags.silent ?? false,
      verbose: flags.verbose ?? false,
      noCommit: flags["no-commit"] ?? false,
      commitMode: (flags.mode ?? "none") as CommitMode,
    };

    // Check for uncommitted changes
    const changes = await hasUncommittedChanges();
    const hasChanges = changes.staged || changes.unstaged || changes.untracked;

    // Auto-commit if there are changes (unless --no-commit flag)
    if (hasChanges && !options.noCommit) {
      if (options.verbose) {
        console.log("\n[relay] ForgeCode auto-commit: checking for changes...");
      }

      // Stage all changes
      await runGitCommand(["add", "-A"]);

      // Generate conventional commit message
      if (options.verbose) {
        console.log("\n[relay] Generating conventional commit message...");
      }

      let commitMessage = await generateConventionalCommit();

      // Fallback to WIP if generation fails
      if (!commitMessage) {
        commitMessage = "WIP: forge session changes";
        if (options.verbose) {
          console.log("[relay] AI commit message generation failed, using WIP fallback");
        }
      } else if (options.verbose) {
        console.log(`[relay] Commit message: ${commitMessage}`);
      }

      // Try to commit
      let commitSuccess = false;
      let attempts = 0;
      const maxNormalAttempts = 3;

      while (!commitSuccess) {
        attempts++;

        const useNoVerify =
          options.commitMode === "none" ||
          (options.commitMode === "normal" && attempts >= maxNormalAttempts);

        const commitArgs = ["commit", "-m", commitMessage, ...(useNoVerify ? ["--no-verify"] : [])];

        if (options.verbose) {
          console.log(
            `[relay] Commit attempt ${attempts}${useNoVerify ? " (--no-verify)" : ""}...`,
          );
        }

        const commitResult = await runGitCommand(commitArgs);

        if (commitResult.success) {
          commitSuccess = true;
          if (!options.silent) {
            console.log(
              `[relay] Changes committed${useNoVerify ? " (with --no-verify)" : ""}: ${commitMessage}`,
            );
          }

          // Auto-push after commit
          const pushResult = await runGitCommand(["push"]);
          if (pushResult.success) {
            if (!options.silent) {
              console.log("[relay] Pushed to remote");
            }
          } else if (options.verbose) {
            console.log(`[relay] Push failed: ${pushResult.output.split("\n")[0]}`);
          }
        } else {
          const shouldRetry =
            options.commitMode === "critical" ||
            (options.commitMode === "normal" && attempts < maxNormalAttempts);

          if (!shouldRetry) {
            break;
          }

          if (options.verbose) {
            console.log("[relay] Commit failed, running formatter and retrying...");
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
          await runGitCommand(["add", "-A"]);
        }
      }

      if (!commitSuccess) {
        console.error("[relay] Failed to commit after multiple attempts");
        console.error("Please commit manually: git add -A && git commit");
      }
    }

    // Send notification
    if (!options.silent || options.verbose) {
      sendNotification(
        "ForgeCode",
        hasChanges && !options.noCommit ? "Session ended with auto-commit" : "Session ended",
      );
    }

    if (options.silent) {
      return;
    }

    // Show summary in non-silent mode
    await this.renderApp(
      <Section title="ForgeCode Session End">
        <Box flexDirection="column">
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
