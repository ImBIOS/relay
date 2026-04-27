import type { OpencodeClient } from "@opencode-ai/sdk";
import type { Plugin } from "./types.js";
import { withOpencode } from "./opencode-client.js";
import { spawn, getSmartDiff, hasUncommittedChanges } from "./git-utils.js";

const COMMIT_MESSAGE_SCHEMA = {
  type: "object" as const,
  properties: {
    type: {
      type: "string",
      enum: [
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
      ] as const,
      description: "The type of change",
    },
    scope: {
      type: "string",
      description: "Optional scope (e.g., plugin name, module)",
    },
    message: {
      type: "string",
      description: "Short description (max 72 chars, imperative mood, no period)",
      maxLength: 72,
    },
    breaking: {
      type: "boolean",
      description: "Whether this is a breaking change",
    },
  },
  required: ["type", "message"],
  additionalProperties: false,
};

async function generateCommitMessage(
  client: OpencodeClient,
  diff: string,
  stat: string,
  truncated: boolean,
): Promise<string> {
  const session = await client.session.create({
    body: { title: "relay-commit" },
  });
  const sessionId = session.data?.id;
  if (!sessionId) throw new Error("No session ID returned from session.create");

  const truncationNote = truncated
    ? `\n\n[Note: diff was truncated. Full stat summary:\n${stat}]`
    : "";

  const prompt = `Analyze this git diff and generate a conventional commit message.

Follow Conventional Commits v1.0.0: <type>(<scope>): <description>

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert

Rules:
- description: imperative mood ("add feature" not "added feature"), max 72 chars, no trailing period
- Use scope for specificity (e.g., plugin, sdk, cli)
- Add ! before : for breaking changes (e.g., feat(api)!: redesign endpoint)
- If multiple changes, pick the most significant type

Git diff:
${diff}${truncationNote}`;

  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: prompt }],
    },
    // @ts-expect-error - https://github.com/anomalyco/opencode/issues/14875
    format: {
      type: "json_schema",
      schema: COMMIT_MESSAGE_SCHEMA,
    },
  });

  const structured =
    // @ts-expect-error - https://github.com/anomalyco/opencode/issues/14875
    result?.data?.info?.structured;

  if (!structured?.type || !structured?.message) {
    throw new Error(
      "Invalid response structure from commit message generation: " + JSON.stringify(structured),
    );
  }

  const scope = structured.scope ? `(${structured.scope})` : "";
  const breaking = structured.breaking ? "!" : "";
  return `${structured.type}${scope}${breaking}: ${structured.message}`;
}

function extractSessionId(event: Record<string, unknown>): string | undefined {
  const props = event.properties as Record<string, unknown> | undefined;
  if (props?.sessionID && typeof props.sessionID === "string") return props.sessionID;
  if (typeof event.sessionID === "string") return event.sessionID;
  return undefined;
}

const ENABLE_CONTEXT_INJECTION = false;

export const RelayCommit: Plugin = async ({ $, directory, client }) => {
  const log = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>,
  ) =>
    client?.app?.log?.({
      body: { service: "relay-commit", level, message, ...extra },
    }) ?? Promise.resolve();

  async function sendNotification(title: string, message: string) {
    try {
      if (process.platform === "darwin") {
        const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
        await $`osascript -e ${script}`.catch(() => {});
      } else if (process.platform === "linux") {
        await $`notify-send ${title} ${message} -i dialog-information`.catch(() => {});
      }
    } catch {}
  }

  async function injectContext(sessionId: string, text: string) {
    if (!ENABLE_CONTEXT_INJECTION || !client) return;
    try {
      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
          noReply: true,
        },
      });
    } catch {
      await log("debug", "Failed to inject context back to main session");
    }
  }

  async function doCommit(mainSessionId?: string) {
    try {
      await log("info", "Checking for changes to commit");
      const changes = await hasUncommittedChanges(directory);
      if (!changes.has) {
        await log("debug", "No uncommitted changes");
        return;
      }

      if (changes.conflicted) {
        await log(
          "warn",
          "Merge conflicts detected — skipping auto-commit. Resolve conflicts first.",
        );
        if (mainSessionId) {
          await injectContext(
            mainSessionId,
            "[relay-commit] Skipped: merge conflicts detected. Resolve conflicts and commit manually.",
          );
        }
        return;
      }

      await spawn(["add", "-A"], directory);

      const diffInfo = await getSmartDiff(directory);
      if (!diffInfo.diff.trim()) {
        await log("debug", "Empty diff after staging, skipping");
        return;
      }

      await log("info", "Generating commit message");
      const commitMessage = await withOpencode((c) =>
        generateCommitMessage(c, diffInfo.diff, diffInfo.stat, diffInfo.truncated),
      );

      await log("info", "Committing", { commitMessage });

      const commitResult = await spawn(["commit", "-m", commitMessage, "--no-verify"], directory);
      if (!commitResult.ok) {
        await log("error", "Commit failed", { stderr: commitResult.stderr });
        await sendNotification("relay-commit", "Commit failed: " + commitMessage);
        if (mainSessionId) {
          await injectContext(
            mainSessionId,
            `[relay-commit] Commit failed: ${commitMessage}. stderr: ${commitResult.stderr}`,
          );
        }
        return;
      }

      let pushed = false;
      let forcePushed = false;
      let pushResult = await spawn(["push"], directory);
      if (!pushResult.ok) {
        if (
          pushResult.stderr.includes("diverged") ||
          pushResult.stderr.includes("Updates were rejected")
        ) {
          const pullResult = await spawn(["pull", "--rebase"], directory);
          if (pullResult.ok) {
            pushResult = await spawn(["push"], directory);
          } else {
            await log("warn", "Pull --rebase failed, attempting force-with-lease");
            pushResult = await spawn(["push", "--force-with-lease"], directory);
            forcePushed = pushResult.ok;
          }
        }
      }
      pushed = pushResult.ok;

      if (forcePushed) {
        await log("warn", "Force-pushed (with lease)", { commitMessage });
      }

      const statusText = pushed
        ? forcePushed
          ? "Committed & force-pushed (lease)"
          : "Committed & pushed"
        : "Committed (push failed)";
      await log("info", statusText, { commitMessage, pushed, forcePushed });
      await sendNotification("relay-commit", `${statusText}: ${commitMessage}`);

      if (mainSessionId) {
        await injectContext(mainSessionId, `[relay-commit] ${statusText}: ${commitMessage}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await log("error", "Unexpected error in doCommit", { error: message });
      if (mainSessionId) {
        await injectContext(mainSessionId, `[relay-commit] Error: ${message}`);
      }
    }
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sessionId = extractSessionId(event as Record<string, unknown>);
        doCommit(sessionId);
      }
    },
  };
};
