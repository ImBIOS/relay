import type { OpencodeClient } from "@opencode-ai/sdk";
import type { Plugin } from "./types.js";
import { withOpencode } from "./opencode-client.js";
import { spawn, getSmartDiff, hasUncommittedChanges } from "./git-utils.js";

export interface SecurityIssue {
  file: string;
  line?: number;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  description: string;
  suggestion: string;
}

export interface SecurityAnalysisResult {
  issues: SecurityIssue[];
  hasCritical: boolean;
  summary: string;
}

const SECURITY_SCHEMA = {
  type: "object" as const,
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          type: { type: "string" },
          description: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["file", "severity", "type", "description", "suggestion"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" },
  },
  required: ["issues", "summary"],
  additionalProperties: false,
};

const SECURITY_PROMPT = `You are a security auditor. Analyze this git diff for security vulnerabilities.

Check for:
- Hardcoded secrets, API keys, passwords, tokens, private keys
- SQL injection, XSS, CSRF vulnerabilities
- Command injection, path traversal, SSRF
- Insecure deserialization, eval() usage
- Weak cryptography or hashing (MD5, SHA1 for passwords)
- Missing input validation or sanitization
- Authentication/authorization bypasses
- Exposed sensitive data in logs or API responses
- Insecure defaults (debug mode, CORS *, etc.)
- Race conditions in concurrent code
- Unsafe regex (ReDoS)
- Dependency vulnerability indicators

Rules:
- Only flag REAL vulnerabilities, not false positives
- Be specific about the exact file and issue
- Provide actionable suggestions
- Use "critical" for secrets/credentials exposed, "high" for exploitable vulns, "medium" for potential issues, "low" for best practices`;

export async function analyzeSecurity(
  client: OpencodeClient,
  diff: string,
  stat: string,
  truncated: boolean,
): Promise<SecurityAnalysisResult> {
  const session = await client.session.create({
    body: { title: "relay-security-analysis" },
  });
  const sessionId = session.data?.id;
  if (!sessionId) throw new Error("No session ID from session.create");

  const truncationNote = truncated
    ? `\n\n[Note: diff was truncated. Full stat summary:\n${stat}]`
    : "";

  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text: `${SECURITY_PROMPT}\n\nGit diff:\n${diff}${truncationNote}` }],
      // @ts-expect-error - https://github.com/anomalyco/opencode/issues/14875
      format: {
        type: "json_schema",
        schema: SECURITY_SCHEMA,
      },
    },
  });

  const structured =
    // @ts-expect-error - https://github.com/anomalyco/opencode/issues/14875
    result?.data?.info?.structured;

  if (!structured?.issues || !structured?.summary) {
    throw new Error(
      "Invalid response from security analysis: missing issues or summary",
    );
  }

  const issues: SecurityIssue[] = structured.issues;
  return {
    issues,
    hasCritical: issues.some(
      (i) => i.severity === "critical" || i.severity === "high",
    ),
    summary: structured.summary as string,
  };
}

export const RelaySecurityAnalysis: Plugin = async ({
  $,
  directory,
  client,
}) => {
  const log = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>,
  ) =>
    client?.app?.log?.({
      body: { service: "relay-security-analysis", level, message, ...extra },
    }) ?? Promise.resolve();

  async function sendNotification(title: string, message: string) {
    try {
      if (process.platform === "darwin") {
        const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
        await $`osascript -e ${script}`.catch(() => {});
      } else if (process.platform === "linux") {
        await $`notify-send ${title} ${message} -i dialog-information`.catch(
          () => {},
        );
      }
    } catch {}
  }

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const changes = await hasUncommittedChanges(directory);
        if (!changes.has) return;

        const diffInfo = await getSmartDiff(directory, undefined, { stagedOnly: false });
        if (!diffInfo.diff.trim()) return;

        await log("info", "Running security analysis");
        const result = await withOpencode((c) =>
          analyzeSecurity(c, diffInfo.diff, diffInfo.stat, diffInfo.truncated),
        );

        if (result.issues.length > 0) {
          await log("warn", `Found ${result.issues.length} security issue(s)`, {
            issues: result.issues,
            summary: result.summary,
          });

          if (result.hasCritical) {
            await sendNotification(
              "relay-security",
              `CRITICAL: ${result.issues.length} security issue(s) found!`,
            );
          }
        } else {
          await log("debug", "No security issues found");
        }
      }
    },
  };
};
