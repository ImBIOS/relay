/**
 * @module patch/pr
 * PR creation for per-feature branches on fork and upstream PR submission.
 *
 * Creates isolated branches for each patch feature, pushes them,
 * and opens PRs both on the fork and optionally on the upstream repo.
 */
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { FeatureEntry } from "./types";
import { loadUpstreamConfig, loadRegistry, saveRegistry, upsertFeature, parsePatchFile } from "./core";

// ---------------------------------------------------------------------------
// Git helpers via Bun.spawn
// ---------------------------------------------------------------------------

async function git(args: string[], cwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: cwd ?? process.cwd(),
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

async function gh(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

// ---------------------------------------------------------------------------
// Per-feature PR on fork
// ---------------------------------------------------------------------------

export interface FeaturePRResult {
  featureSlug: string;
  branchName: string;
  prUrl: string | null;
  prNumber: number | null;
  error?: string;
}

/**
 * Creates an isolated branch for a feature patch and opens a PR on the fork.
 *
 * The branch is created from main, the patch is applied via AI, and then
 * a PR is opened against the fork's main branch.
 */
export async function createFeaturePR(
  feature: FeatureEntry,
  options?: {
    baseBranch?: string;
    dryRun?: boolean;
  },
): Promise<FeaturePRResult> {
  const slug = `${feature.id}-${feature.slug}`;
  const baseBranch = options?.baseBranch ?? "main";
  const branchName = `feature/${slug}`;

  // Ensure we're on main and up to date
  await git(["checkout", baseBranch]);
  await git(["pull", "origin", baseBranch]);

  if (options?.dryRun) {
    console.log(`[DRY RUN] Would create branch: ${branchName}`);
    console.log(`[DRY RUN] Would apply patch for: ${slug}`);
    console.log(`[DRY RUN] Would open PR against: ${baseBranch}`);
    return { featureSlug: slug, branchName, prUrl: null, prNumber: null };
  }

  // Delete existing branch if it exists
  await git(["branch", "-D", branchName]).catch(() => {});
  await git(["push", "origin", "--delete", branchName]).catch(() => {});

  // Create new branch
  const branchResult = await git(["checkout", "-b", branchName]);
  if (branchResult.exitCode !== 0) {
    return { featureSlug: slug, branchName, prUrl: null, prNumber: null, error: `Failed to create branch: ${branchResult.stderr}` };
  }

  // Read patch intent for PR description
  const patchPath = join(".relay", "features", slug, "patch.md");
  const parsed = parsePatchFile(patchPath);
  const intent = parsed?.intent ?? feature.description ?? `Feature ${slug}`;
  const reconciliation = parsed?.reconciliation ?? "";

  // The actual patch application is done by `relay patch apply --feature <slug>`
  // Here we just create the branch structure and PR
  // After the caller runs `apply`, they should call commitAndPushFeatureBranch

  const prBody = buildFeaturePRBody(feature, intent, reconciliation);

  // Push branch
  const pushResult = await git(["push", "origin", branchName]);
  if (pushResult.exitCode !== 0) {
    // Branch might be empty — that's okay, still create PR
  }

  // Create PR
  const prResult = await gh([
    "pr", "create",
    "--title", `feat: ${slug} — ${feature.description ?? feature.slug}`,
    "--body", prBody,
    "--base", baseBranch,
    "--head", branchName,
    "--label", "relay-patch,feature",
  ]);

  if (prResult.exitCode !== 0) {
    return { featureSlug: slug, branchName, prUrl: null, prNumber: null, error: `Failed to create PR: ${prResult.stderr}` };
  }

  // Parse PR URL from output
  const prUrl = prResult.stdout.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)?.[0] ?? null;
  const prNumber = prUrl ? parseInt(prUrl.match(/\/pull\/(\d+)/)?.[1] ?? "0", 10) : null;

  // Switch back to base branch
  await git(["checkout", baseBranch]);

  return { featureSlug: slug, branchName, prUrl, prNumber };
}

/**
 * Commit all changes on the current feature branch and push.
 */
export async function commitAndPushFeatureBranch(
  branchName: string,
  message: string,
): Promise<boolean> {
  await git(["add", "-A"]);
  const result = await git(["commit", "-m", message, "--allow-empty"]);
  if (result.exitCode !== 0) {
    // Maybe nothing to commit
    return true;
  }
  const pushResult = await git(["push", "origin", branchName, "--force-with-lease"]);
  return pushResult.exitCode === 0;
}

// ---------------------------------------------------------------------------
// Upstream PR creation
// ---------------------------------------------------------------------------

export interface UpstreamPRResult {
  featureSlug: string;
  upstreamIssueUrl: string | null;
  upstreamPRUrl: string | null;
  error?: string;
}

/**
 * Creates an issue on the upstream repo for a feature patch, and optionally
 * a PR with the actual code changes from the feature branch.
 */
export async function createUpstreamPR(
  feature: FeatureEntry,
  options?: {
    forkBranch?: string;
    dryRun?: boolean;
    createPR?: boolean;
  },
): Promise<UpstreamPRResult> {
  const slug = `${feature.id}-${feature.slug}`;
  const config = loadUpstreamConfig();
  const upstream = config?.upstream;

  if (!upstream) {
    return { featureSlug: slug, upstreamIssueUrl: null, upstreamPRUrl: null, error: "No upstream configured" };
  }

  const patchPath = join(".relay", "features", slug, "patch.md");
  const parsed = parsePatchFile(patchPath);
  const intent = parsed?.intent ?? feature.description ?? `Feature: ${slug}`;
  const reconciliation = parsed?.reconciliation ?? "";

  if (options?.dryRun) {
    console.log(`[DRY RUN] Would create issue on ${upstream} for: ${slug}`);
    if (options?.createPR) {
      console.log(`[DRY RUN] Would create PR on ${upstream} from fork branch: ${options.forkBranch ?? slug}`);
    }
    return { featureSlug: slug, upstreamIssueUrl: null, upstreamPRUrl: null };
  }

  // Create upstream issue
  const issueBody = buildUpstreamIssueBody(feature, intent, reconciliation);
  const issueResult = await gh([
    "issue", "create",
    "--repo", upstream,
    "--title", `Feature Request: ${feature.description ?? feature.slug}`,
    "--body", issueBody,
    "--label", "enhancement",
  ]);

  let issueUrl: string | null = null;
  if (issueResult.exitCode === 0) {
    issueUrl = issueResult.stdout.match(/https:\/\/github\.com\/\S+\/issues\/\d+/)?.[0] ?? null;
  }

  // Create upstream PR if requested and we have a feature branch
  let prUrl: string | null = null;
  if (options?.createPR && options.forkBranch) {
    const forkRepo = await getForkRepo();
    if (forkRepo) {
      const head = `${forkRepo}:${options.forkBranch}`;
      const prBody = buildUpstreamPRBody(feature, intent, reconciliation, issueUrl);

      const prResult = await gh([
        "pr", "create",
        "--repo", upstream,
        "--head", head,
        "--base", config?.upstreamBranch ?? "main",
        "--title", `feat: ${feature.description ?? feature.slug}`,
        "--body", prBody,
      ]);

      if (prResult.exitCode === 0) {
        prUrl = prResult.stdout.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)?.[0] ?? null;
      }
    }
  }

  // Update registry with upstream URLs
  const registry = loadRegistry();
  const entry = registry.features.find((f) => f.id === feature.id);
  if (entry) {
    if (issueUrl) entry.upstreamIssue = issueUrl;
    if (prUrl) entry.upstreamPR = prUrl;
    upsertFeature(registry, entry);
    saveRegistry(registry);
  }

  return { featureSlug: slug, upstreamIssueUrl: issueUrl, upstreamPRUrl: prUrl };
}

// ---------------------------------------------------------------------------
// Conflict audit report
// ---------------------------------------------------------------------------

export interface ConflictAudit {
  featureSlug: string;
  hasConflict: boolean;
  conflictFiles: string[];
  conflictDetails: string;
  suggestedAction: "reapply" | "manual" | "retire";
}

/**
 * Runs a conflict audit for all active patches.
 * Checks for merge conflict markers and uncommitted conflicts.
 */
export async function runConflictAudit(): Promise<ConflictAudit[]> {
  const registry = loadRegistry();
  const activeFeatures = registry.features.filter((f) => f.status === "active" && f.hasPatch);
  const audits: ConflictAudit[] = [];

  for (const feature of activeFeatures) {
    const slug = `${feature.id}-${feature.slug}`;
    const audit = await auditFeatureConflicts(feature, slug);
    audits.push(audit);
  }

  return audits;
}

async function auditFeatureConflicts(feature: FeatureEntry, slug: string): Promise<ConflictAudit> {
  // Check for conflict markers in affected files
  const affectedFiles = feature.affectedFiles ?? [];
  const conflictFiles: string[] = [];
  let conflictDetails = "";

  if (affectedFiles.length > 0) {
    for (const fileGlob of affectedFiles) {
      const result = await git(["grep", "-l", "<<<<<<< HEAD", "--", fileGlob]);
      if (result.exitCode === 0 && result.stdout) {
        conflictFiles.push(...result.stdout.split("\n").filter(Boolean));
      }
    }
  }

  // Also check the conflict.md file
  const conflictPath = join(".relay", "features", slug, "conflict.md");
  if (existsSync(conflictPath)) {
    conflictDetails = readFileSync(conflictPath, "utf-8");
  }

  const hasConflict = conflictFiles.length > 0 || conflictDetails.length > 0;

  let suggestedAction: ConflictAudit["suggestedAction"] = "reapply";
  if (feature.conflictCount > 3) {
    suggestedAction = "manual";
  }
  if (feature.conflictCount > 10 && feature.reapplyCount > 15) {
    suggestedAction = "retire";
  }

  return {
    featureSlug: slug,
    hasConflict,
    conflictFiles,
    conflictDetails,
    suggestedAction,
  };
}

/**
 * Creates a GitHub issue on the fork for conflict audit results.
 */
export async function createConflictAuditIssue(
  audits: ConflictAudit[],
  options?: { dryRun?: boolean },
): Promise<string | null> {
  const conflicted = audits.filter((a) => a.hasConflict);
  if (conflicted.length === 0) return null;

  const body = buildConflictAuditBody(conflicted);

  if (options?.dryRun) {
    console.log(`[DRY RUN] Would create conflict audit issue`);
    console.log(body.slice(0, 500));
    return null;
  }

  const result = await gh([
    "issue", "create",
    "--title", `Conflict Audit Report — ${new Date().toISOString().split("T")[0]}`,
    "--body", body,
    "--label", "relay-patch,conflict",
  ]);

  return result.exitCode === 0
    ? result.stdout.match(/https:\/\/github\.com\/\S+\/issues\/\d+/)?.[0] ?? null
    : null;
}

// ---------------------------------------------------------------------------
// Health dashboard (GitHub step summary)
// ---------------------------------------------------------------------------

export function buildHealthDashboard(): string {
  const registry = loadRegistry();
  const config = loadUpstreamConfig();

  const active = registry.features.filter((f) => f.status === "active" && f.hasPatch);
  const retired = registry.features.filter((f) => f.status === "retired");
  const conflicted = registry.features.filter((f) => f.status === "conflicted");
  const partial = registry.features.filter((f) => f.status === "partial");
  const pending = registry.features.filter((f) => f.status === "pending");

  const lines: string[] = [];
  lines.push("## Relay Patch Health Dashboard");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Upstream | ${config?.upstream ?? "(auto-detect)"} |`);
  lines.push(`| Branch | ${config?.upstreamBranch ?? "main"} |`);
  lines.push(`| AI Re-apply | ${config?.aiReapply ? "enabled" : "disabled"} |`);
  lines.push(`| Active Patches | ${active.length} |`);
  lines.push(`| Retired | ${retired.length} |`);
  lines.push(`| Conflicted | ${conflicted.length} |`);
  lines.push(`| Partial Merge | ${partial.length} |`);
  lines.push(`| Pending | ${pending.length} |`);
  lines.push(`| Health Score | ${registry.forkHealthScore ?? "N/A"} |`);
  lines.push(`| Last Sync | ${registry.lastSync ?? "never"} |`);
  lines.push(`| Last Patch Apply | ${registry.lastPatchApply ?? "never"} |`);
  lines.push("");

  if (active.length > 0) {
    lines.push("### Active Features");
    lines.push("");
    lines.push("| ID | Slug | Re-applies | Conflicts | Upstream |");
    lines.push("|----|------|-----------|-----------|----------|");
    for (const f of active) {
      const upstream = f.upstreamIssue ? "[issue]" + (f.upstreamPR ? " [PR]" : "") : "none";
      lines.push(`| ${f.id} | ${f.slug} | ${f.reapplyCount ?? 0} | ${f.conflictCount ?? 0} | ${upstream} |`);
    }
    lines.push("");
  }

  if (conflicted.length > 0) {
    lines.push("### Conflicted Features (need attention)");
    lines.push("");
    for (const f of conflicted) {
      lines.push(`- **${f.id}-${f.slug}**: ${f.notes ?? "unknown conflict"}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getForkRepo(): Promise<string | null> {
  const result = await git(["remote", "get-url", "origin"]);
  if (result.exitCode !== 0) return null;
  const url = result.stdout;
  // Extract owner/repo from various URL formats
  const match = url.match(/(?:github\.com[:/])([^/]+\/[^/\s]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

function buildFeaturePRBody(feature: FeatureEntry, intent: string, reconciliation: string): string {
  const parts: string[] = [];
  parts.push(`## Feature: ${feature.id}-${feature.slug}`);
  parts.push("");
  if (feature.description) {
    parts.push(feature.description);
    parts.push("");
  }
  parts.push("### Intent");
  parts.push(intent);
  parts.push("");
  if (reconciliation) {
    parts.push("### Reconciliation Notes");
    parts.push(reconciliation);
    parts.push("");
  }
  if (feature.dependsOn?.length) {
    parts.push(`### Dependencies`);
    parts.push(feature.dependsOn.map((d) => `- ${d}`).join("\n"));
    parts.push("");
  }
  parts.push("---");
  parts.push("*This PR was created automatically by Relay Patch.*");
  return parts.join("\n");
}

function buildUpstreamIssueBody(feature: FeatureEntry, intent: string, reconciliation: string): string {
  const parts: string[] = [];
  parts.push(`## Feature Proposal: ${feature.description ?? feature.slug}`);
  parts.push("");
  parts.push("### Problem / Motivation");
  parts.push(intent);
  parts.push("");
  if (reconciliation) {
    parts.push("### Implementation Notes");
    parts.push(reconciliation);
    parts.push("");
  }
  parts.push("---");
  parts.push("*This issue was created automatically by [Relay Patch](https://github.com/ImBIOS/relay) from a fork customization.*");
  return parts.join("\n");
}

function buildUpstreamPRBody(
  feature: FeatureEntry,
  intent: string,
  reconciliation: string,
  issueUrl: string | null,
): string {
  const parts: string[] = [];
  parts.push(`## Feature: ${feature.description ?? feature.slug}`);
  parts.push("");
  if (issueUrl) {
    parts.push(`Closes ${issueUrl}`);
    parts.push("");
  }
  parts.push("### Changes");
  parts.push(intent);
  parts.push("");
  if (reconciliation) {
    parts.push("### Notes");
    parts.push(reconciliation);
    parts.push("");
  }
  parts.push("---");
  parts.push("*This PR was submitted automatically by [Relay Patch](https://github.com/ImBIOS/relay) from a fork.*");
  return parts.join("\n");
}

function buildConflictAuditBody(conflicts: ConflictAudit[]): string {
  const parts: string[] = [];
  parts.push("## Conflict Audit Report");
  parts.push("");
  parts.push(`**Date**: ${new Date().toISOString()}`);
  parts.push(`**Conflicts Found**: ${conflicts.length}`);
  parts.push("");

  for (const c of conflicts) {
    parts.push(`### ${c.featureSlug}`);
    parts.push(`- **Suggested Action**: ${c.suggestedAction}`);
    if (c.conflictFiles.length > 0) {
      parts.push(`- **Conflict Files**: ${c.conflictFiles.join(", ")}`);
    }
    if (c.conflictDetails) {
      parts.push("");
      parts.push("```");
      parts.push(c.conflictDetails.slice(0, 2000));
      parts.push("```");
    }
    parts.push("");
  }

  parts.push("---");
  parts.push("*Generated by [Relay Patch](https://github.com/ImBIOS/relay)*");
  return parts.join("\n");
}
