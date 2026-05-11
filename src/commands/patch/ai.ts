/**
 * @module patch/ai
 * AI-powered patch re-application using the ForgeCode SDK.
 *
 * Reads a patch.md file, constructs a prompt from the intent and
 * reconciliation notes, and uses the forge binary via the SDK to
 * re-apply the changes to the codebase.
 */
import { join } from "node:path";
import { query } from "@imbios/forgecode-sdk";
import type { UpstreamConfig, PatchApplyResult } from "./types";
import { parsePatchFile, loadUpstreamConfig } from "./core";
import type { ParsedPatch } from "./core";

// ---------------------------------------------------------------------------
// Patch prompt construction
// ---------------------------------------------------------------------------

function buildReapplyPrompt(
  patch: ParsedPatch,
  _config: UpstreamConfig,
  diffContext?: string,
): string {
  const parts: string[] = [];

  parts.push(
    `You are a Relay Patch re-application agent. Your job is to re-apply a feature patch to the codebase.`,
  );
  parts.push(
    `The upstream repository has been synced and some changes may have conflicted with or overwritten the patched feature.`,
  );
  parts.push("");
  parts.push(`## Feature: ${patch.frontmatter.featureId}`);
  parts.push(`Complexity: ${patch.frontmatter.complexity}/5`);
  parts.push("");

  if (patch.intent) {
    parts.push("## Intent");
    parts.push(patch.intent);
    parts.push("");
  }

  if (patch.reconciliation) {
    parts.push("## Reconciliation Notes");
    parts.push(
      "These notes describe how to reconcile conflicts between the upstream changes and the local patch:",
    );
    parts.push(patch.reconciliation);
    parts.push("");
  }

  if (diffContext) {
    parts.push("## Recent Changes from Upstream");
    parts.push("The following diff shows recent upstream changes that may have affected this feature:");
    parts.push("```diff");
    parts.push(diffContext);
    parts.push("```");
    parts.push("");
  }

  parts.push("## Instructions");
  parts.push("1. Read the intent and reconciliation notes carefully.");
  parts.push("2. Examine the current codebase to understand what changed from upstream.");
  parts.push("3. Re-apply the feature changes described in the intent, adapting to any upstream changes.");
  parts.push("4. Make sure the feature still works correctly with the updated codebase.");
  parts.push("5. Do NOT modify files that are not related to this feature.");
  parts.push("6. If you cannot safely re-apply the patch, create a file at `.relay/features/${featureId}/conflict.md` explaining the issue.");
  parts.push("");

  const affectedFiles = (patch.frontmatter as Record<string, unknown>).affectedFiles as string[] | undefined;
  if (affectedFiles?.length) {
    parts.push("## Affected Files");
    parts.push(affectedFiles.map((f: string) => `- ${f}`).join("\n"));
    parts.push("");
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Conflict detection via git diff
// ---------------------------------------------------------------------------

async function getUpstreamDiff(featureDir: string): Promise<string> {
  try {
    const proc = Bun.spawn(
      ["git", "diff", "HEAD~1", "--", join(featureDir, "..", "..")],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.cwd(),
      },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) return "";
    const stdout = await new Response(proc.stdout).text();
    // Truncate to 4000 chars to avoid overly large prompts
    return stdout.slice(0, 4000);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Main AI re-apply function
// ---------------------------------------------------------------------------

export async function aiReapplyPatch(
  featureSlug: string,
  options?: {
    dryRun?: boolean;
    model?: string;
    maxTurns?: number;
    diffContext?: string;
  },
): Promise<PatchApplyResult> {
  const startTime = Date.now();
  const patchPath = join(".relay", "features", featureSlug, "patch.md");
  const patch = parsePatchFile(patchPath);

  if (!patch) {
    return {
      featureId: featureSlug,
      slug: featureSlug,
      success: false,
      filesChanged: [],
      error: `No patch.md found at ${patchPath}`,
      durationMs: Date.now() - startTime,
    };
  }

  const config = loadUpstreamConfig();
  const model = options?.model ?? config?.aiModel ?? "claude-sonnet-4-20250514";
  const maxTurns = options?.maxTurns ?? config?.aiMaxTurns ?? 30;

  // Get upstream diff context
  const diffContext =
    options?.diffContext ?? (await getUpstreamDiff(join(".relay", "features", featureSlug)));

  const prompt = buildReapplyPrompt(patch, config ?? { enabled: true } as UpstreamConfig, diffContext);

  if (options?.dryRun) {
    console.log(`[DRY RUN] Would send prompt to forge (${prompt.length} chars)`);
    console.log(`[DRY RUN] Model: ${model}, Max turns: ${maxTurns}`);
    return {
      featureId: patch.frontmatter.featureId,
      slug: featureSlug,
      success: true,
      filesChanged: [],
      durationMs: Date.now() - startTime,
    };
  }

  let sessionId: string | undefined;
  let hasError = false;
  let errorMessage = "";

  try {
    for await (const message of query({
      prompt,
      options: {
        agent: "forge",
        model,
        maxTurns,
        cwd: process.cwd(),
        systemPrompt: "You are a code patching agent. Apply changes precisely and minimally.",
        allowedTools: ["read", "write", "edit", "bash"],
      },
    })) {
      switch (message.type) {
        case "system":
          sessionId = message.session_id;
          break;
        case "assistant":
          // Stream progress
          if (message.content.includes("```") || message.content.startsWith(" ")) {
            process.stdout.write(".");
          }
          break;
        case "result":
          // Result consumed by the AI agent internally
          break;
        case "error":
          hasError = true;
          errorMessage = message.error;
          break;
      }
    }
  } catch (err) {
    hasError = true;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Detect files changed by the AI
  const filesChanged = await detectChangedFiles();

  return {
    featureId: patch.frontmatter.featureId,
    slug: featureSlug,
    success: !hasError,
    filesChanged,
    aiSessionId: sessionId,
    error: hasError ? errorMessage : undefined,
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------------------
// Detect changed files via git
// ---------------------------------------------------------------------------

async function detectChangedFiles(): Promise<string[]> {
  try {
    const proc = Bun.spawn(["git", "diff", "--name-only", "--diff-filter=M"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
    });
    await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    return stdout
      .trim()
      .split("\n")
      .filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Batch re-apply with dependency ordering
// ---------------------------------------------------------------------------

export async function aiReapplyAll(
  options?: {
    dryRun?: boolean;
    model?: string;
    maxTurns?: number;
    featureSlugs?: string[];
  },
): Promise<PatchApplyResult[]> {
  const { listPatches, loadRegistry, topologicalSort, findFeature } = await import("./core");
  const slugs = options?.featureSlugs ?? listPatches();

  if (slugs.length === 0) return [];

  const registry = loadRegistry();
  const features = slugs
    .map((slug) => findFeature(registry, slug))
    .filter((f): f is NonNullable<typeof f> => f != null);

  const ordered = topologicalSort(features);
  const results: PatchApplyResult[] = [];

  for (const feature of ordered) {
    const slug = `${feature.id}-${feature.slug}`;
    console.log(`\nApplying patch: ${slug}...`);
    const result = await aiReapplyPatch(slug, options);
    results.push(result);

    if (result.success) {
      console.log(` OK (${result.durationMs}ms, ${result.filesChanged.length} files)`);
    } else {
      console.log(` FAILED: ${result.error}`);
    }
  }

  return results;
}
