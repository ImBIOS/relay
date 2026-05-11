/**
 * @module patch/analyze
 * Fork health analysis and recommendation engine.
 *
 * Analyzes the current fork's patch registry, upstream sync status,
 * and maintenance burden to recommend whether to keep the fork,
 * go independent, or request human review.
 */
import { execSync } from "node:child_process";
import type { ForkAnalysis, FeatureEntry, FeatureStatus } from "./types";
import { loadRegistry, loadUpstreamConfig } from "./core";

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function getGitOutput(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function getDaysSinceDivergence(): number | undefined {
  const output = getGitOutput("git log --format=%at --reverse | head -1");
  if (!output) return undefined;
  const firstCommit = Number(output) * 1000;
  const now = Date.now();
  return Math.floor((now - firstCommit) / (1000 * 60 * 60 * 24));
}

function getCommitsAhead(): number {
  const config = loadUpstreamConfig();
  const upstream = config?.upstream;
  if (!upstream) return 0;
  const branch = config?.upstreamBranch ?? "main";
  try {
    getGitOutput(`git remote add upstream-temp https://github.com/${upstream}.git 2>/dev/null || true`);
    getGitOutput("git fetch upstream-temp 2>/dev/null || true");
    const output = getGitOutput(`git rev-list upstream-temp/${branch}..HEAD --count`);
    getGitOutput("git remote remove upstream-temp 2>/dev/null || true");
    return Number(output) || 0;
  } catch {
    return 0;
  }
}

function getCommitsBehind(): number {
  const config = loadUpstreamConfig();
  const upstream = config?.upstream;
  if (!upstream) return 0;
  const branch = config?.upstreamBranch ?? "main";
  try {
    getGitOutput(`git remote add upstream-temp https://github.com/${upstream}.git 2>/dev/null || true`);
    getGitOutput("git fetch upstream-temp 2>/dev/null || true");
    const output = getGitOutput(`git rev-list HEAD..upstream-temp/${branch} --count`);
    getGitOutput("git remote remove upstream-temp 2>/dev/null || true");
    return Number(output) || 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Feature scoring
// ---------------------------------------------------------------------------

function estimateEffortScore(feature: FeatureEntry): number {
  let score = 1;
  score += (feature.reapplyCount ?? 0) * 0.5;
  score += (feature.conflictCount ?? 0) * 1.0;
  if (feature.status === "conflicted") score += 3;
  if (feature.status === "partial") score += 2;
  return Math.min(10, score);
}

function estimateUpstreamLikelihood(
  feature: FeatureEntry,
): "high" | "medium" | "low" | "unknown" {
  if (feature.upstreamPR) return "high";
  if (feature.upstreamIssue) return "medium";
  if (feature.status === "retired") return "high";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Health score computation
// ---------------------------------------------------------------------------

function computeHealthScore(
  activePatches: number,
  conflictRate: number,
  avgReapplyCount: number,
  pendingUpstream: number,
): number {
  let score = 100;

  // Penalty for many active patches (maintenance burden)
  score -= Math.min(30, activePatches * 5);

  // Penalty for high conflict rate
  score -= Math.min(25, conflictRate * 50);

  // Penalty for many re-applies (unstable patches)
  score -= Math.min(20, avgReapplyCount * 2);

  // Bonus for patches with upstream tracking
  score += Math.min(15, pendingUpstream * 3);

  return Math.max(0, Math.min(100, score));
}

// ---------------------------------------------------------------------------
// Recommendation engine
// ---------------------------------------------------------------------------

function computeRecommendation(
  healthScore: number,
  activePatches: number,
  conflictRate: number,
  avgReapplyCount: number,
  commitsAhead: number,
): { recommendation: ForkAnalysis["recommendation"]; reasoning: string } {
  if (healthScore >= 70 && activePatches <= 5 && conflictRate < 0.2) {
    return {
      recommendation: "keep-fork",
      reasoning:
        `Fork is healthy (score: ${healthScore}/100). ` +
        `${activePatches} active patches with low conflict rate (${(conflictRate * 100).toFixed(0)}%). ` +
        `Maintenance burden is manageable.`,
    };
  }

  if (healthScore < 40 || conflictRate > 0.5 || avgReapplyCount > 10) {
    return {
      recommendation: "go-independent",
      reasoning:
        `Fork health is poor (score: ${healthScore}/100). ` +
        `High conflict rate (${(conflictRate * 100).toFixed(0)}%) and/or excessive re-applies (avg: ${avgReapplyCount.toFixed(1)}). ` +
        `Consider forking into an independent repo to avoid ongoing sync burden. ` +
        `${commitsAhead} commits ahead of upstream.`,
    };
  }

  return {
    recommendation: "needs-review",
    reasoning:
      `Fork health is moderate (score: ${healthScore}/100). ` +
      `Some patches have conflicts or high maintenance. ` +
      `Manual review recommended to decide between keeping the fork or going independent.`,
  };
}

// ---------------------------------------------------------------------------
// Main analysis function
// ---------------------------------------------------------------------------

export function analyzeFork(): ForkAnalysis {
  const registry = loadRegistry();

  const activeFeatures = registry.features.filter((f) => f.status === "active" && f.hasPatch);
  const retiredFeatures = registry.features.filter((f) => f.status === "retired");
  const pendingUpstream = registry.features.filter(
    (f) => f.upstreamIssue && f.status !== "retired",
  );

  const conflictRate =
    activeFeatures.length > 0
      ? activeFeatures.reduce((sum, f) => sum + (f.conflictCount ?? 0), 0) /
        activeFeatures.reduce((sum, f) => sum + Math.max(1, f.reapplyCount ?? 1), 0)
      : 0;

  const avgReapplyCount =
    activeFeatures.length > 0
      ? activeFeatures.reduce((sum, f) => sum + (f.reapplyCount ?? 0), 0) / activeFeatures.length
      : 0;

  const daysSinceDivergence = getDaysSinceDivergence();
  const commitsAhead = getCommitsAhead();
  const commitsBehind = getCommitsBehind();

  const healthScore = computeHealthScore(
    activeFeatures.length,
    conflictRate,
    avgReapplyCount,
    pendingUpstream.length,
  );

  const { recommendation, reasoning } = computeRecommendation(
    healthScore,
    activeFeatures.length,
    conflictRate,
    avgReapplyCount,
    commitsAhead,
  );

  const estimatedEffortHours =
    activeFeatures.length * 0.5 + avgReapplyCount * 0.3 + conflictRate * activeFeatures.length * 2;

  return {
    activePatches: activeFeatures.length,
    retiredPatches: retiredFeatures.length,
    pendingUpstream: pendingUpstream.length,
    avgReapplyCount,
    conflictRate,
    daysSinceDivergence,
    commitsAhead,
    commitsBehind,
    healthScore,
    recommendation,
    reasoning,
    estimatedEffortHours,
    features: registry.features.map((f) => ({
      id: f.id,
      slug: f.slug,
      status: f.status as FeatureStatus,
      effortScore: estimateEffortScore(f),
      upstreamLikelihood: estimateUpstreamLikelihood(f),
    })),
  };
}
