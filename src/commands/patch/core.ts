/**
 * @module patch/core
 * Core logic for the Relay Patch system.
 *
 * Manages .relay/ directory structure, registry reads/writes,
 * patch file parsing, and validation.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  renameSync,
} from "node:fs";
import { join, basename } from "node:path";
import {
  RegistrySchema,
  UpstreamConfigSchema,
  FeatureStatus,
  type Registry,
  type UpstreamConfig,
  type FeatureEntry,
  type PatchFrontmatter,
  PatchFrontmatterSchema,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RELAY_DIR = ".relay";
export const REGISTRY_FILE = join(RELAY_DIR, "registry.json");
export const UPSTREAM_FILE = join(RELAY_DIR, "upstream.json");
export const FEATURES_DIR = join(RELAY_DIR, "features");
export const WORKFLOWS_DIR = join(".github", "workflows");

// ---------------------------------------------------------------------------
// Atomic file writes (per AGENTS.md rule #6)
// ---------------------------------------------------------------------------

function atomicWrite(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, filePath);
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

/** Map old status values to new schema. */
const STATUS_MIGRATION: Record<string, FeatureStatus> = {
  proposed: "pending",
  "in-progress": "active",
  implemented: "active",
  deprecated: "retired",
  removed: "retired",
};

function migrateFeatureStatus(status: string): string {
  return STATUS_MIGRATION[status] ?? status;
}

function migrateRegistry(data: Record<string, unknown>): Registry {
  // Migrate old status values in features
  if (Array.isArray(data.features)) {
    for (const feat of data.features) {
      if (feat && typeof feat.status === "string") {
        feat.status = migrateFeatureStatus(feat.status);
      }
      // Remove old fields that aren't in the new schema
      delete feat.title;
      delete feat.lastUpdated;
      // Add missing fields with defaults
      if (!feat.description) feat.description = feat.title ?? "";
      if (!feat.dependsOn) feat.dependsOn = [];
      if (!feat.reapplyCount) feat.reapplyCount = 0;
      if (!feat.conflictCount) feat.conflictCount = 0;
      if (!feat.affectedFiles) feat.affectedFiles = [];
    }
  }
  return RegistrySchema.parse(data);
}

// ---------------------------------------------------------------------------
// Registry operations
// ---------------------------------------------------------------------------

export function ensureRelayDir(): void {
  if (!existsSync(RELAY_DIR)) {
    mkdirSync(RELAY_DIR, { recursive: true });
  }
  if (!existsSync(FEATURES_DIR)) {
    mkdirSync(FEATURES_DIR, { recursive: true });
  }
  if (!existsSync(WORKFLOWS_DIR)) {
    mkdirSync(WORKFLOWS_DIR, { recursive: true });
  }
}

export function loadRegistry(): Registry {
  if (!existsSync(REGISTRY_FILE)) {
    return RegistrySchema.parse({});
  }
  const raw = readFileSync(REGISTRY_FILE, "utf-8");
  const data = JSON.parse(raw);
  return migrateRegistry(data);
}

export function saveRegistry(registry: Registry): void {
  ensureRelayDir();
  atomicWrite(REGISTRY_FILE, JSON.stringify(registry, null, 2) + "\n");
}

export function findFeature(registry: Registry, idOrSlug: string): FeatureEntry | undefined {
  return registry.features.find(
    (f) => f.id === idOrSlug || f.slug === idOrSlug || `${f.id}-${f.slug}` === idOrSlug,
  );
}

export function upsertFeature(registry: Registry, feature: FeatureEntry): Registry {
  const idx = registry.features.findIndex((f) => f.id === feature.id);
  if (idx >= 0) {
    registry.features[idx] = feature;
  } else {
    registry.features.push(feature);
  }
  return registry;
}

// ---------------------------------------------------------------------------
// Upstream config operations
// ---------------------------------------------------------------------------

export function loadUpstreamConfig(): UpstreamConfig | null {
  if (!existsSync(UPSTREAM_FILE)) {
    return null;
  }
  const raw = readFileSync(UPSTREAM_FILE, "utf-8");
  return UpstreamConfigSchema.parse(JSON.parse(raw));
}

export function saveUpstreamConfig(config: UpstreamConfig): void {
  ensureRelayDir();
  atomicWrite(UPSTREAM_FILE, JSON.stringify(config, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Patch file operations
// ---------------------------------------------------------------------------

export interface ParsedPatch {
  frontmatter: PatchFrontmatter;
  intent: string;
  reconciliation: string;
  rawContent: string;
  dir: string;
}

export function parsePatchFile(patchPath: string): ParsedPatch | null {
  if (!existsSync(patchPath)) return null;

  const raw = readFileSync(patchPath, "utf-8");
  const dir = basename(join(patchPath, ".."));

  // Extract YAML-like frontmatter between --- markers
  let frontmatter: PatchFrontmatter = {
    featureId: dir,
    priority: 100,
    aiRequired: true,
    complexity: 3,
    tags: [],
  };

  let contentStart = 0;
  if (raw.startsWith("---")) {
    const endIdx = raw.indexOf("---", 3);
    if (endIdx > 0) {
      const fmText = raw.slice(3, endIdx).trim();
      try {
        // Simple key: value parser (no YAML dependency)
        const parsed: Record<string, unknown> = {};
        for (const line of fmText.split("\n")) {
          const match = line.match(/^(\w+):\s*(.+)$/);
          if (match?.[1] && match?.[2]) {
            const key = match[1];
            let value: unknown = match[2].trim();
            // Parse arrays [a, b, c]
            if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
              value = value
                .slice(1, -1)
                .split(",")
                .map((s) => s.trim().replace(/['"]/g, ""));
            }
            // Parse booleans
            if (value === "true") value = true;
            if (value === "false") value = false;
            // Parse numbers
            if (typeof value === "string" && /^\d+$/.test(value)) {
              value = Number(value);
            }
            parsed[key] = value;
          }
        }
        frontmatter = PatchFrontmatterSchema.parse({ featureId: dir, ...parsed });
      } catch {
        // Use defaults if frontmatter parse fails
      }
      contentStart = endIdx + 3;
    }
  }

  const content = raw.slice(contentStart).trim();

  // Extract ## Intent section
  const intentMatch = content.match(
    /^## Intent\s*\n([\s\S]*?)(?=\n## |\n$|$)/m,
  );
  const intent = intentMatch?.[1]?.trim() ?? "";

  // Extract ## Reconciliation Notes section
  const reconMatch = content.match(
    /^## Reconciliation Notes\s*\n([\s\S]*?)(?=\n## |\n$|$)/m,
  );
  const reconciliation = reconMatch?.[1]?.trim() ?? "";

  return { frontmatter, intent, reconciliation, rawContent: content, dir };
}

export function listPatches(): string[] {
  if (!existsSync(FEATURES_DIR)) return [];
  return readdirSync(FEATURES_DIR)
    .filter((name) => {
      const p = join(FEATURES_DIR, name);
      return statSync(p).isDirectory() && existsSync(join(p, "patch.md"));
    })
    .sort();
}

export function listFeatures(): string[] {
  if (!existsSync(FEATURES_DIR)) return [];
  return readdirSync(FEATURES_DIR)
    .filter((name) => statSync(join(FEATURES_DIR, name)).isDirectory())
    .sort();
}

// ---------------------------------------------------------------------------
// Patch validation
// ---------------------------------------------------------------------------

export interface ValidationError {
  file: string;
  message: string;
  severity: "error" | "warning";
}

export function validatePatch(patchPath: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const parsed = parsePatchFile(patchPath);

  if (!parsed) {
    errors.push({ file: patchPath, message: "Patch file not found or empty", severity: "error" });
    return errors;
  }

  // Check required sections
  if (!parsed.intent) {
    errors.push({
      file: patchPath,
      message: "Missing '## Intent' section",
      severity: "error",
    });
  }

  if (!parsed.reconciliation) {
    errors.push({
      file: patchPath,
      message: "Missing '## Reconciliation Notes' section",
      severity: "warning",
    });
  }

  // Check frontmatter
  if (parsed.frontmatter.complexity < 1 || parsed.frontmatter.complexity > 5) {
    errors.push({
      file: patchPath,
      message: `Invalid complexity: ${parsed.frontmatter.complexity} (must be 1-5)`,
      severity: "error",
    });
  }

  // Check for dependency cycles
  const registry = loadRegistry();
  const feature = findFeature(registry, parsed.frontmatter.featureId);
  if (feature?.dependsOn?.length) {
    const visited = new Set<string>();
    const hasCycle = (id: string): boolean => {
      if (visited.has(id)) return true;
      visited.add(id);
      const dep = findFeature(registry, id);
      return dep?.dependsOn?.some(hasCycle) ?? false;
    };
    if (feature.dependsOn.some(hasCycle)) {
      errors.push({
        file: patchPath,
        message: "Dependency cycle detected",
        severity: "error",
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Dependency ordering
// ---------------------------------------------------------------------------

export function topologicalSort(features: FeatureEntry[]): FeatureEntry[] {
  const sorted: FeatureEntry[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const byId = new Map(features.map((f) => [f.id, f]));

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (visiting.has(id)) return; // cycle — skip
    visiting.add(id);

    const feature = byId.get(id);
    if (feature?.dependsOn) {
      for (const depId of feature.dependsOn) {
        visit(depId);
      }
    }
    visiting.delete(id);
    visited.add(id);
    if (feature) sorted.push(feature);
  }

  for (const f of features) {
    visit(f.id);
  }

  // Sort by priority within same dependency level
  return sorted.sort((a, b) => {
    // Dependencies come first
    const aDeps = a.dependsOn ?? [];
    const bDeps = b.dependsOn ?? [];
    if (aDeps.includes(b.id)) return 1;
    if (bDeps.includes(a.id)) return -1;
    return 0;
  });
}
