import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import {
  loadRegistry,
  loadUpstreamConfig,
  listPatches,
  listFeatures,
} from "./core";
import { analyzeFork } from "./fork-analysis";
import {
  divider,
  ok,
  warn,
  heading,
  dim,
  bullet,
  bulletActive,
  bulletInactive,
  success,
  error as errIcon,
  bgRed,
  bgGreen,
  bgYellow,
} from "../../utils/console";

export default class PatchStatus extends BaseCommand<typeof PatchStatus> {
  static description = "Show patch status and fork health overview";

  static flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
    verbose: Flags.boolean({ char: "v", description: "Show detailed info for each feature" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchStatus);

    const registry = loadRegistry();
    const config = loadUpstreamConfig();
    const patches = listPatches();
    const features = listFeatures();

    if (flags.json) {
      console.log(JSON.stringify({ registry, config, patches, features }, null, 2));
      return;
    }

    console.log("");
    console.log(heading("relay patch status"));
    console.log(divider());

    // Upstream config
    if (config) {
      console.log(bullet(`Upstream: ${config.upstream ?? "(auto-detect)"}`));
      console.log(bullet(`Branch: ${config.upstreamBranch}`));
      console.log(bullet(`AI re-apply: ${config.aiReapply ? "enabled" : "disabled"}`));
      console.log(bullet(`Model: ${config.aiModel}`));
    } else {
      console.log(warn("Not configured. Run `relay patch install` first."));
      return;
    }

    console.log("");
    console.log(divider());

    // Summary
    const active = registry.features.filter((f) => f.status === "active" && f.hasPatch);
    const retired = registry.features.filter((f) => f.status === "retired");
    const conflicted = registry.features.filter((f) => f.status === "conflicted");
    const partial = registry.features.filter((f) => f.status === "partial");

    console.log(heading("Summary:"));
    console.log(`  ${bulletActive(`${active.length} active patches`)}`);
    console.log(`  ${bulletInactive(`${retired.length} retired (merged upstream)`)}`);
    if (conflicted.length > 0) {
      console.log(`  ${bgRed(` ${conflicted.length} conflicted `)}`);
    }
    if (partial.length > 0) {
      console.log(`  ${bgYellow(` ${partial.length} partial merge `)}`);
    }
    console.log(`  ${dim(`${features.length} total feature directories`)}`);

    if (registry.lastSync) {
      console.log(`  ${dim(`Last sync: ${registry.lastSync}`)}`);
    }
    if (registry.lastPatchApply) {
      console.log(`  ${dim(`Last patch apply: ${registry.lastPatchApply}`)}`);
    }

    // Feature list
    if (registry.features.length > 0) {
      console.log("");
      console.log(divider());
      console.log(heading("Features:"));

      for (const f of registry.features) {
        const statusIcon =
          f.status === "active"
            ? success("")
            : f.status === "retired"
              ? ok("retired ")
              : f.status === "conflicted"
                ? errIcon("conflict ")
                : f.status === "partial"
                  ? warn("partial ")
                  : bulletInactive("");

        const patchIcon = f.hasPatch ? "p" : " ";
        const upstreamIcon = f.upstreamIssue ? "u" : " ";
        const prIcon = f.upstreamPR ? "pr" : "  ";

        console.log(
          `  ${statusIcon} [${patchIcon}${upstreamIcon}${prIcon}] ${f.id}-${f.slug}`,
        );

        if (flags.verbose) {
          if (f.dependsOn?.length) {
            console.log(`    ${dim(`depends on: ${f.dependsOn.join(", ")}`)}`);
          }
          if (f.reapplyCount) {
            console.log(`    ${dim(`re-applied ${f.reapplyCount} times`)}`);
          }
          if (f.conflictCount) {
            console.log(`    ${dim(`${f.conflictCount} conflicts encountered`)}`);
          }
          if (f.lastApplied) {
            console.log(`    ${dim(`last applied: ${f.lastApplied}`)}`);
          }
          if (f.notes) {
            console.log(`    ${dim(f.notes)}`);
          }
        }
      }
    }

    // Quick health score
    if (active.length > 0) {
      console.log("");
      console.log(divider());
      try {
        const analysis = analyzeFork();
        const scoreColor =
          analysis.healthScore >= 70
            ? bgGreen
            : analysis.healthScore >= 40
              ? bgYellow
              : bgRed;
        console.log(`  Health: ${scoreColor(` ${analysis.healthScore}/100 `)} ${dim(`— ${analysis.recommendation}`)}`);
      } catch {
        console.log(dim("  Run `relay patch analyze` for detailed health analysis."));
      }
    }

    console.log("");
  }
}
