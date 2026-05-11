import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadRegistry,
  saveRegistry,
  loadUpstreamConfig,
  listPatches,
  ensureRelayDir,
  findFeature,
  upsertFeature,
} from "./core";
import { aiReapplyPatch, aiReapplyAll } from "./ai";
import type { FeatureEntry, PatchApplyResult } from "./types";
import {
  divider,
  ok,
  warn,
  heading,
  dim,
  bullet,
  success,
  error as errIcon,
} from "../../utils/console";

export default class PatchApply extends BaseCommand<typeof PatchApply> {
  static description = "Re-apply patches (AI-powered with forgecode-sdk)";

  static flags = {
    feature: Flags.string({
      description: "Feature slug to apply (e.g., '001-proxy'), or 'all'",
      default: "all",
    }),
    "dry-run": Flags.boolean({
      description: "Show what would be applied without making changes",
      default: false,
    }),
    "no-ai": Flags.boolean({
      description: "Skip AI re-application, only update registry",
      default: false,
    }),
    model: Flags.string({
      description: "AI model to use for re-application",
    }),
    "max-turns": Flags.integer({
      description: "Maximum AI turns per patch",
      default: 30,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchApply);

    console.log("");
    console.log(heading("relay patch apply"));
    console.log(divider());

    const config = loadUpstreamConfig();
    const registry = loadRegistry();
    const patches = listPatches();

    if (patches.length === 0) {
      console.log(ok("No patches to apply."));
      return;
    }

    const target = flags.feature;
    const isAll = target === "all";
    const targets = isAll ? patches : [target].filter((t) => patches.includes(t));

    if (targets.length === 0 && !isAll) {
      console.log(warn(`Feature '${target}' not found. Available: ${patches.join(", ")}`));
      return;
    }

    console.log(bullet(`Target: ${isAll ? "all" : targets.join(", ")}`));
    console.log(bullet(`Mode: ${flags["dry-run"] ? "dry-run" : "live"}`));
    console.log(bullet(`AI: ${flags["no-ai"] ? "disabled" : `enabled (${flags.model ?? config?.aiModel ?? "claude-sonnet-4-20250514"})`}`));
    console.log("");

    // Auto-register features that have patches but aren't in registry
    for (const slug of targets) {
      const existing = findFeature(registry, slug);
      if (!existing) {
        const id = slug.match(/^(\d+)/)?.[1] ?? slug;
        const featureSlug = slug.replace(/^\d+-/, "") ?? slug;
        const entry: FeatureEntry = {
          id,
          slug: featureSlug,
          status: "active",
          hasPatch: true,
          dependsOn: [],
          reapplyCount: 0,
          conflictCount: 0,
          affectedFiles: [],
        };
        upsertFeature(registry, entry);
        console.log(dim(`  Registered feature: ${slug}`));
      }
    }

    if (flags["no-ai"]) {
      // Just update registry timestamps
      for (const slug of targets) {
        const feature = findFeature(registry, slug);
        if (feature) {
          feature.lastApplied = new Date().toISOString();
          feature.reapplyCount = (feature.reapplyCount ?? 0) + 1;
          upsertFeature(registry, feature);
        }
      }
      registry.lastPatchApply = new Date().toISOString();
      saveRegistry(registry);
      console.log(ok("Registry updated (AI skipped)."));
      return;
    }

    // AI-powered re-application
    const results: PatchApplyResult[] = [];

    if (isAll) {
      const allResults = await aiReapplyAll({
        dryRun: flags["dry-run"],
        model: flags.model,
        maxTurns: flags["max-turns"],
        featureSlugs: targets,
      });
      results.push(...allResults);
    } else {
      for (const slug of targets) {
        console.log(dim(`Applying: ${slug}...`));
        const result = await aiReapplyPatch(slug, {
          dryRun: flags["dry-run"],
          model: flags.model,
          maxTurns: flags["max-turns"],
        });
        results.push(result);
      }
    }

    // Update registry with results
    for (const result of results) {
      const feature = findFeature(registry, result.featureId) ??
        findFeature(registry, result.slug);

      if (feature) {
        feature.lastApplied = new Date().toISOString();
        feature.reapplyCount = (feature.reapplyCount ?? 0) + 1;
        if (result.success) {
          feature.status = "active";
        } else {
          feature.status = "conflicted";
          feature.conflictCount = (feature.conflictCount ?? 0) + 1;
        }
        if (result.error) {
          feature.notes = result.error;
        }
        upsertFeature(registry, feature);

        // Write conflict file if failed
        if (!result.success && !flags["dry-run"]) {
          const conflictPath = join(".relay", "features", result.slug, "conflict.md");
          ensureRelayDir();
          writeFileSync(
            conflictPath,
            `# Conflict Report\n\nGenerated: ${new Date().toISOString()}\n\n## Error\n${result.error ?? "Unknown error"}\n`,
            "utf-8",
          );
        }
      }
    }

    registry.lastPatchApply = new Date().toISOString();
    saveRegistry(registry);

    // Summary
    console.log("");
    console.log(divider());
    console.log(heading("Results:"));
    for (const r of results) {
      const icon = r.success ? success("") : errIcon("");
      console.log(
        `  ${icon} ${r.slug}: ${r.filesChanged.length} files changed (${r.durationMs}ms)`,
      );
      if (r.error) {
        console.log(`    ${dim(r.error)}`);
      }
    }
    console.log("");
  }
}
