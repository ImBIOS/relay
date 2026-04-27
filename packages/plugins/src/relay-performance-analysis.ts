import type { OpencodeClient } from "@opencode-ai/sdk";
import type { Plugin } from "./types.js";
import { withOpencode } from "./opencode-client.js";
import { spawn, getSmartDiff, hasUncommittedChanges } from "./git-utils.js";

export interface PerformanceIssue {
  file: string;
  line?: number;
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  description: string;
  suggestion: string;
}

export interface PerformanceAnalysisResult {
  issues: PerformanceIssue[];
  hasCritical: boolean;
  summary: string;
}

const PERFORMANCE_SCHEMA = {
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

const PERFORMANCE_PROMPT = `You are a performance engineer. Analyze this git diff for performance anti-patterns and regressions.

Check for:
- N+1 database query patterns
- Unnecessary loops, nested iterations (O(n²) or worse)
- Memory leaks: event listeners not cleaned up, closures holding large references, growing arrays/maps never pruned
- Inefficient data structures (array lookup vs Set/Map)
- Missing database indexes for query patterns
- Synchronous operations that should be async (file I/O, network calls)
- Unnecessary re-renders in frontend code (React missing memoization, state churn)
- Large bundle imports (importing entire libraries instead of specific functions)
- Unoptimized recursive calls (missing memoization, no tail-call)
- Blocking operations on the main thread / event loop
- Excessive serialization/deserialization
- Redundant computation (same calculation repeated)
- Connection pool exhaustion or missing pooling
- Unbounded concurrency (Promise.all without limit)
- Expensive operations inside hot paths (tight loops, render functions)

Rules:
- Only flag REAL performance issues with measurable impact, not theoretical concerns
- Consider the context — a loop over 5 items is not a performance issue
- Be specific about the exact file, line, and pattern
- Provide actionable suggestions with concrete alternatives
- Use "critical" for issues causing outages/severe degradation, "high" for significant perf hits, "medium" for moderate, "low" for best practices`;

export async function analyzePerformance(
  client: OpencodeClient,
  diff: string,
  stat: string,
  truncated: boolean,
): Promise<PerformanceAnalysisResult> {
  const session = await client.session.create({
    body: { title: "relay-performance-analysis" },
  });
  const sessionId = session.data?.id;
  if (!sessionId) throw new Error("No session ID from session.create");

  const truncationNote = truncated
    ? `\n\n[Note: diff was truncated. Full stat summary:\n${stat}]`
    : "";

  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [
        {
          type: "text",
          text: `${PERFORMANCE_PROMPT}\n\nGit diff:\n${diff}${truncationNote}`,
        },
      ],
      // @ts-expect-error - https://github.com/anomalyco/opencode/issues/14875
      format: {
        type: "json_schema",
        schema: PERFORMANCE_SCHEMA,
      },
    },
  });

  const structured =
    // @ts-expect-error - https://github.com/anomalyco/opencode/issues/14875
    result?.data?.info?.structured;

  if (!structured?.issues || !structured?.summary) {
    throw new Error("Invalid response from performance analysis: missing issues or summary");
  }

  const issues: PerformanceIssue[] = structured.issues;
  return {
    issues,
    hasCritical: issues.some((i) => i.severity === "critical" || i.severity === "high"),
    summary: structured.summary as string,
  };
}

export const RelayPerformanceAnalysis: Plugin = async ({ $, directory, client }) => {
  const log = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>,
  ) =>
    client?.app?.log?.({
      body: {
        service: "relay-performance-analysis",
        level,
        message,
        ...extra,
      },
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

  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const changes = await hasUncommittedChanges(directory);
        if (!changes.has) return;

        const diffInfo = await getSmartDiff(directory, undefined, { stagedOnly: false });
        if (!diffInfo.diff.trim()) return;

        await log("info", "Running performance analysis");
        const result = await withOpencode((c) =>
          analyzePerformance(c, diffInfo.diff, diffInfo.stat, diffInfo.truncated),
        );

        if (result.issues.length > 0) {
          await log("warn", `Found ${result.issues.length} perf issue(s)`, {
            issues: result.issues,
            summary: result.summary,
          });

          if (result.hasCritical) {
            await sendNotification(
              "relay-perf",
              `CRITICAL: ${result.issues.length} performance issue(s) found!`,
            );
          }
        } else {
          await log("debug", "No performance issues found");
        }
      }
    },
  };
};
