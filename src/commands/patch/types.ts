/**
 * @module patch/types
 * Type definitions and Zod schemas for the Relay Patch system.
 *
 * The patch system manages fork customizations by tracking features,
 * their upstream status, and patch re-application after sync.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Upstream config (.relay/upstream.json)
// ---------------------------------------------------------------------------

export const UpstreamConfigSchema = z.object({
  /** Whether fork sync is enabled. */
  enabled: z.boolean().default(true),
  /** Upstream repository in owner/repo format. Required for non-fork repos. */
  upstream: z.string().optional(),
  /** Upstream branch to sync from. */
  upstreamBranch: z.string().default("main"),
  /** Conflict resolution strategy. */
  conflictStrategy: z.enum(["attempt-rebase", "merge", "fail"]).default("attempt-rebase"),
  /** Whether to re-apply patches after sync. */
  reapplyPatches: z.boolean().default(true),
  /** Whether to manage upstream issues for patches. */
  manageUpstreamIssues: z.boolean().default(true),
  /** Whether to create upstream PRs for patches. */
  createUpstreamPRs: z.boolean().default(true),
  /** Whether to run AI-powered patch re-application. */
  aiReapply: z.boolean().default(true),
  /** AI model to use for patch re-application. */
  aiModel: z.string().default("claude-sonnet-4-20250514"),
  /** Maximum AI turns per patch re-application. */
  aiMaxTurns: z.number().default(30),
});

export type UpstreamConfig = z.infer<typeof UpstreamConfigSchema>;

// ---------------------------------------------------------------------------
// Feature registry (.relay/registry.json)
// ---------------------------------------------------------------------------

export const FeatureStatus = z.enum([
  "active",        // Patch is applied and maintained
  "partial",       // Partially merged upstream, needs human review
  "retired",       // Fully merged upstream, patch removed
  "conflicted",    // Conflict detected during last sync
  "pending",       // Patch created but not yet applied
]);

export type FeatureStatus = z.infer<typeof FeatureStatus>;

export const FeatureEntrySchema = z.object({
  /** Unique numeric ID for the feature. */
  id: z.string(),
  /** Human-readable slug (e.g., "001-proxy-pool"). */
  slug: z.string(),
  /** Short description of the feature. */
  description: z.string().optional(),
  /** Current status of the feature. */
  status: FeatureStatus.default("active"),
  /** Whether this feature has an active patch file. */
  hasPatch: z.boolean().default(false),
  /** URL of the upstream issue tracking this feature. */
  upstreamIssue: z.string().optional(),
  /** URL of the upstream PR for this feature. */
  upstreamPR: z.string().optional(),
  /** Features this patch depends on (IDs). */
  dependsOn: z.array(z.string()).default([]),
  /** ISO timestamp of last patch application. */
  lastApplied: z.string().optional(),
  /** ISO timestamp of last sync check. */
  lastSynced: z.string().optional(),
  /** Number of times this patch has been re-applied. */
  reapplyCount: z.number().default(0),
  /** Number of conflicts encountered. */
  conflictCount: z.number().default(0),
  /** Human-readable notes about the patch state. */
  notes: z.string().optional(),
  /** Files affected by this patch (globs). */
  affectedFiles: z.array(z.string()).default([]),
});

export type FeatureEntry = z.infer<typeof FeatureEntrySchema>;

export const RegistrySchema = z.object({
  /** Schema version for future migrations. */
  version: z.number().default(1),
  /** Feature entries keyed by ID. */
  features: z.array(FeatureEntrySchema).default([]),
  /** ISO timestamp of last sync. */
  lastSync: z.string().optional(),
  /** ISO timestamp of last patch application. */
  lastPatchApply: z.string().optional(),
  /** Fork health score (0-100, computed by analyze). */
  forkHealthScore: z.number().optional(),
});

export type Registry = z.infer<typeof RegistrySchema>;

// ---------------------------------------------------------------------------
// Patch file schema (patch.md frontmatter)
// ---------------------------------------------------------------------------

export const PatchFrontmatterSchema = z.object({
  /** Feature ID this patch belongs to. */
  featureId: z.string(),
  /** Priority for ordering (lower = applied first). */
  priority: z.number().default(100),
  /** Whether this patch requires AI to re-apply. */
  aiRequired: z.boolean().default(true),
  /** Estimated complexity (1-5). */
  complexity: z.number().min(1).max(5).default(3),
  /** Tags for categorization. */
  tags: z.array(z.string()).default([]),
});

export type PatchFrontmatter = z.infer<typeof PatchFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Fork analysis result
// ---------------------------------------------------------------------------

export const ForkAnalysisSchema = z.object({
  /** Total number of active patches. */
  activePatches: z.number(),
  /** Total number of retired patches. */
  retiredPatches: z.number(),
  /** Number of patches with upstream issues open. */
  pendingUpstream: z.number(),
  /** Average re-apply count across active patches. */
  avgReapplyCount: z.number(),
  /** Average conflict rate (0-1). */
  conflictRate: z.number(),
  /** Days since fork diverged from upstream. */
  daysSinceDivergence: z.number().optional(),
  /** Commits ahead of upstream. */
  commitsAhead: z.number().optional(),
  /** Commits behind upstream. */
  commitsBehind: z.number().optional(),
  /** Overall health score (0-100). */
  healthScore: z.number(),
  /** Recommendation: "keep-fork", "go-independent", or "needs-review". */
  recommendation: z.enum(["keep-fork", "go-independent", "needs-review"]),
  /** Human-readable reasoning for the recommendation. */
  reasoning: z.string(),
  /** Estimated monthly maintenance effort in hours. */
  estimatedEffortHours: z.number(),
  /** Per-feature breakdown. */
  features: z.array(z.object({
    id: z.string(),
    slug: z.string(),
    status: FeatureStatus,
    effortScore: z.number(),
    upstreamLikelihood: z.enum(["high", "medium", "low", "unknown"]),
  })),
});

export type ForkAnalysis = z.infer<typeof ForkAnalysisSchema>;

// ---------------------------------------------------------------------------
// Patch apply result
// ---------------------------------------------------------------------------

export interface PatchApplyResult {
  featureId: string;
  slug: string;
  success: boolean;
  filesChanged: string[];
  aiSessionId?: string;
  error?: string;
  durationMs: number;
}
