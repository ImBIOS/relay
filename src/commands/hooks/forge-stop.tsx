#!/usr/bin/env bun
//===============================================================================
// ForgeCode Session End Hook - Auto-commit & Push
// Commits uncommitted changes after a ForgeCode session ends.
// Designed to be called from a shell wrapper function after `forge` exits.
//
// Features:
// - Uses @imbios/forgecode-sdk for commit message generation
// - Generates conventional commit messages via forgecode-sdk structured output
// - Recursively auto-commits & pushes in all git submodules
// - Runs asynchronously (non-blocking) via detached background process
//===============================================================================

import { query } from "@imbios/forgecode-sdk";
import { Flags } from "@oclif/core";
import { Box, Text } from "ink";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { BaseCommand } from "../../oclif/base";
import { Info, Section } from "../../ui/index";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommitMode = "critical" | "normal" | "none";

interface ForgeStopOptions {
  silent: boolean;
  verbose: boolean;
  noCommit: boolean;
  commitMode: CommitMode;
  background: boolean;
}

interface GitChangeStatus {
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

// ---------------------------------------------------------------------------
// Conventional commit schema for structured output
// ---------------------------------------------------------------------------

const CONVENTIONAL_COMMIT_SCHEMA = z.object({
  type: z.enum([
    "feat",
    "fix",
    "docs",
    "style",
    "refactor",
    "test",
    "chore",
    "perf",
    "ci",
    "build",
    "revert",
  ]),
  scope: z.string().max(50).optional(),
  message: z.string().max(72),
  breaking: z.boolean().optional(),
});

type ConventionalCommit = z.infer<typeof CONVENTIONAL_COMMIT_SCHEMA>;

// ---------------------------------------------------------------------------
// Git helpers (work on arbitrary directories)
// ---------------------------------------------------------------------------

function runGitCommand(args: string[], cwd: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
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

async function hasUncommittedChanges(cwd: string): Promise<GitChangeStatus> {
  const gitDir = path.join(cwd, ".git");
  if (!existsSync(gitDir)) {
    return { staged: false, unstaged: false, untracked: false };
  }

  try {
    const statusResult = spawn("git", ["status", "--porcelain"], {
      cwd,
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

/**
 * Get list of submodule paths relative to the given repo directory.
 */
async function getSubmodulePaths(repoDir: string): Promise<string[]> {
  const result = await runGitCommand(
    ["config", "--file", ".gitmodules", "--get-regexp", "path"],
    repoDir,
  );
  if (!result.success) return [];

  const paths: string[] = [];
  for (const line of result.output.trim().split("\n")) {
    // Format: submodule.<name>.path <path>
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      paths.push(parts[parts.length - 1]!);
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Commit message generation via forgecode-sdk
// ---------------------------------------------------------------------------

async function generateConventionalCommit(cwd: string): Promise<string> {
  // Get diff stat to help generate a good commit message
  const diffResult = await runGitCommand(["diff", "--cached", "--stat"], cwd);
  const stagedFiles = diffResult.success ? diffResult.output : "";

  // Get a short diff for more context (limit to avoid huge payloads)
  const shortDiff = await runGitCommand(["diff", "--cached", "--no-color", "-U1"], cwd);
  const diffContent = shortDiff.success ? shortDiff.output.slice(0, 4000) : "";

  const prompt = `Analyze this git diff and generate a conventional commit message.

You MUST reply with ONLY a valid JSON object on a single line, no other text.
Do NOT include any explanation, markdown, or thinking — ONLY the JSON object.

JSON schema:
{"type":"<type>","scope":"<scope>","message":"<description>","breaking":false}

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert

Rules:
- message: imperative mood ("add feature" not "added feature"), max 72 chars, no trailing period
- scope: optional, for specificity (e.g., plugin, sdk, cli)
- breaking: true only if this is a breaking change

Staged files:
${stagedFiles || "No staged files"}

Diff (truncated):
${diffContent || "No diff available"}`;

  try {
    let resultValue: unknown = null;

    for await (const message of query({
      prompt,
      options: {
        model: "MiniMax-M2.7",
        outputFormat: {
          type: "json_schema",
          z: CONVENTIONAL_COMMIT_SCHEMA,
        },
        env: {
          RELAY_IN_HOOK: "1",
        },
      },
    })) {
      if (message.type === "result") {
        resultValue = message.result;
      }
    }

    if (!resultValue) {
      throw new Error(
        "[relay] forgecode-sdk returned no result for commit message generation",
      );
    }

    // Case 1: SDK validated the JSON schema — result is a ConventionalCommit object
    if (typeof resultValue === "object" && resultValue !== null) {
      const commit = CONVENTIONAL_COMMIT_SCHEMA.safeParse(resultValue);
      if (commit.success) {
        const c = commit.data as ConventionalCommit;
        const scope = c.scope ? `(${c.scope})` : "";
        const breaking = c.breaking ? "!" : "";
        return `${c.type}${scope}${breaking}: ${c.message}`;
      }
    }

    // Case 2: SDK returned raw text — try to extract JSON from it
    if (typeof resultValue === "string") {
      const raw = resultValue.trim();

      // Try JSON extraction (handles markdown fences, embedded JSON, etc.)
      try {
        const { extractJsonFromText } = await import("@imbios/forgecode-sdk");
        const extracted = extractJsonFromText(raw);
        const commit = CONVENTIONAL_COMMIT_SCHEMA.safeParse(extracted);
        if (commit.success) {
          const c = commit.data as ConventionalCommit;
          const scope = c.scope ? `(${c.scope})` : "";
          const breaking = c.breaking ? "!" : "";
          return `${c.type}${scope}${breaking}: ${c.message}`;
        }
      } catch {
        // JSON extraction failed, try plain text parse below
      }

      // Try to parse as a plain conventional commit line: type(scope)!: message
      const CONVENTIONAL_LINE_RE = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\([^)]+\))?!?:\s*.+$/;
      const firstLine = raw.split("\n").find((l) => CONVENTIONAL_LINE_RE.test(l.trim()));
      if (firstLine) {
        return firstLine.trim();
      }
    }

    throw new Error(
      `[relay] forgecode-sdk returned invalid commit message: ${JSON.stringify(resultValue)}`,
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("[relay]")) throw err;
    throw new Error(
      `[relay] Failed to generate conventional commit message: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Core commit & push logic for a single repo directory
// ---------------------------------------------------------------------------

async function commitAndPush(
  cwd: string,
  label: string,
  options: {
    verbose: boolean;
    silent: boolean;
    commitMode: CommitMode;
  },
): Promise<boolean> {
  const changes = await hasUncommittedChanges(cwd);
  const hasChanges = changes.staged || changes.unstaged || changes.untracked;

  if (!hasChanges) {
    if (options.verbose) {
      console.log(`[relay] ${label}: no changes to commit`);
    }
    return true;
  }

  if (options.verbose) {
    console.log(`\n[relay] ${label}: auto-commit: checking for changes...`);
  }

  // Stage all changes
  await runGitCommand(["add", "-A"], cwd);

  // Generate conventional commit message via forgecode-sdk
  if (options.verbose) {
    console.log(`[relay] ${label}: generating conventional commit message...`);
  }

  let commitMessage: string;
  try {
    commitMessage = await generateConventionalCommit(cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[relay] ${label}: ${msg}`);
    console.error(`[relay] ${label}: uncommitted changes remain — commit manually`);
    return false;
  }

  if (options.verbose) {
    console.log(`[relay] ${label}: commit message: ${commitMessage}`);
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
        `[relay] ${label}: commit attempt ${attempts}${useNoVerify ? " (--no-verify)" : ""}...`,
      );
    }

    const commitResult = await runGitCommand(commitArgs, cwd);

    if (commitResult.success) {
      commitSuccess = true;
      if (!options.silent) {
        console.log(
          `[relay] ${label}: committed${useNoVerify ? " (with --no-verify)" : ""}: ${commitMessage}`,
        );
      }

      // Auto-push after commit
      const pushResult = await runGitCommand(["push"], cwd);
      if (pushResult.success) {
        if (!options.silent) {
          console.log(`[relay] ${label}: pushed to remote`);
        }
      } else if (options.verbose) {
        console.log(`[relay] ${label}: push failed: ${pushResult.output.split("\n")[0]}`);
      }
    } else {
      const shouldRetry =
        options.commitMode === "critical" ||
        (options.commitMode === "normal" && attempts < maxNormalAttempts);

      if (!shouldRetry) {
        break;
      }

      if (options.verbose) {
        console.log(`[relay] ${label}: commit failed, running formatter and retrying...`);
        console.log(`   Error: ${commitResult.output.split("\n")[0]}`);
      }

      // Run formatter to fix issues
      await new Promise<void>((resolve) => {
        spawn("bun", ["x", "ultracite", "fix"], {
          cwd,
          stdio: options.verbose ? "inherit" : "ignore",
          shell: true,
        }).on("close", () => resolve());
      });

      // Re-stage files after formatting
      await runGitCommand(["add", "-A"], cwd);
    }
  }

  if (!commitSuccess) {
    console.error(`[relay] ${label}: failed to commit after multiple attempts`);
    console.error(`[relay] ${label}: please commit manually: git add -A && git commit`);
    return false;
  }

  return true;
}

/**
 * Recursively commit & push in the main repo and all submodules.
 * Processes submodules first (deepest-first), then the parent repo.
 */
async function recursiveCommitAndPush(
  repoDir: string,
  label: string,
  options: {
    verbose: boolean;
    silent: boolean;
    commitMode: CommitMode;
  },
): Promise<void> {
  // 1. Get submodule paths
  const submodules = await getSubmodulePaths(repoDir);

  // 2. Recursively commit in each submodule first
  for (const subPath of submodules) {
    const absSubPath = path.resolve(repoDir, subPath);
    const subLabel = `${label}/${subPath}`;
    await recursiveCommitAndPush(absSubPath, subLabel, options);
  }

  // 3. Commit in the parent repo (after submodules so the submodule pointer
  //    updates are included in the parent commit)
  await commitAndPush(repoDir, label, options);
}

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default class HooksForgeStop extends BaseCommand<typeof HooksForgeStop> {
  static description = "ForgeCode session end hook - auto-commit after forge exits";

  static examples = [
    "<%= config.bin %> hooks forge-stop",
    "relay hooks forge-stop --silent",
    "relay hooks forge-stop --mode critical",
    "relay hooks forge-stop --background",
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
    background: Flags.boolean({
      description:
        "Run commit & push in a detached background process (non-blocking). Default: true.",
      default: true,
      allowNo: true,
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
      background: flags.background ?? true,
    };

    const workDir = process.cwd();

    if (options.noCommit) {
      if (!options.silent) {
        sendNotification("ForgeCode", "Session ended (commit skipped)");
      }
      return;
    }

    if (options.background) {
      // Spawn a detached background process for non-blocking operation.
      // Use the `relay` CLI directly so oclif routing works correctly.
      const child = spawn(
        "relay",
        [
          "hooks",
          "forge-stop",
          "--no-background",
          ...(options.silent ? ["--silent"] : []),
          ...(options.verbose ? ["--verbose"] : []),
          `--mode=${options.commitMode}`,
        ],
        {
          cwd: workDir,
          detached: true,
          stdio: "ignore",
          env: {
            ...process.env,
            // Prevent the child from re-spawning another background process
            RELAY_FORGE_BACKGROUND: "1",
          },
        },
      );
      child.unref();
      return;
    }

    // --- Synchronous path (runs in background child or when --no-background) ---

    const changes = await hasUncommittedChanges(workDir);
    const hasChanges = changes.staged || changes.unstaged || changes.untracked;

    // Recursively commit & push in main repo and all submodules
    await recursiveCommitAndPush(workDir, "forge", {
      verbose: options.verbose,
      silent: options.silent,
      commitMode: options.commitMode,
    });

    // Send notification
    if (!options.silent || options.verbose) {
      sendNotification(
        "ForgeCode",
        hasChanges ? "Session ended with auto-commit" : "Session ended",
      );
    }

    if (options.silent) {
      return;
    }

    // Show summary in non-silent mode
    await this.renderApp(
      <Section title="ForgeCode Session End">
        <Box flexDirection="column">
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
