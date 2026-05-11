import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { analyzeFork } from "./fork-analysis";
import { loadRegistry, saveRegistry } from "./core";
import type { ForkAnalysis } from "./types";
import {
  divider,
  ok,
  warn,
  heading,
  dim,
  bullet,
  success,
  error as errIcon,
  bgRed,
  bgGreen,
  bgYellow,
} from "../../utils/console";

export default class PatchAnalyze extends BaseCommand<typeof PatchAnalyze> {
  static description = "Analyze fork health and recommend keep-fork vs go-independent";

  static flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
    save: Flags.boolean({
      description: "Save analysis to registry.json",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchAnalyze);

    console.log("");
    console.log(heading("relay patch analyze"));
    console.log(divider());

    let analysis: ForkAnalysis;
    try {
      analysis = analyzeFork();
    } catch (err) {
      console.log(errIcon("Analysis failed: " + (err instanceof Error ? err.message : String(err))));
      return;
    }

    if (flags.json) {
      console.log(JSON.stringify(analysis, null, 2));
      return;
    }

    // Health score
    const scoreColor =
      analysis.healthScore >= 70
        ? bgGreen
        : analysis.healthScore >= 40
          ? bgYellow
          : bgRed;
    console.log(`  Health Score: ${scoreColor(` ${analysis.healthScore}/100 `)}`);
    console.log("");

    // Recommendation
    const recIcon =
      analysis.recommendation === "keep-fork"
        ? success
        : analysis.recommendation === "go-independent"
          ? errIcon
          : warn;
    console.log(`  Recommendation: ${recIcon(analysis.recommendation)}`);
    console.log(`  ${dim(analysis.reasoning)}`);
    console.log("");

    // Metrics
    console.log(divider());
    console.log(heading("Metrics:"));
    console.log(bullet(`Active patches: ${analysis.activePatches}`));
    console.log(bullet(`Retired patches: ${analysis.retiredPatches}`));
    console.log(bullet(`Pending upstream: ${analysis.pendingUpstream}`));
    console.log(bullet(`Avg re-apply count: ${analysis.avgReapplyCount.toFixed(1)}`));
    console.log(bullet(`Conflict rate: ${(analysis.conflictRate * 100).toFixed(0)}%`));
    console.log(bullet(`Estimated monthly effort: ${analysis.estimatedEffortHours.toFixed(1)}h`));

    if (analysis.daysSinceDivergence != null) {
      console.log(bullet(`Days since divergence: ${analysis.daysSinceDivergence}`));
    }
    if (analysis.commitsAhead != null) {
      console.log(bullet(`Commits ahead: ${analysis.commitsAhead}`));
    }
    if (analysis.commitsBehind != null) {
      console.log(bullet(`Commits behind: ${analysis.commitsBehind}`));
    }

    // Per-feature breakdown
    if (analysis.features.length > 0) {
      console.log("");
      console.log(divider());
      console.log(heading("Per-Feature Breakdown:"));

      for (const f of analysis.features) {
        const statusIcon =
          f.status === "active"
            ? success("")
            : f.status === "retired"
              ? ok("")
              : f.status === "conflicted"
                ? errIcon("")
                : warn("");
        const upstreamLabel =
          f.upstreamLikelihood === "high"
            ? "likely upstream"
            : f.upstreamLikelihood === "medium"
              ? "maybe upstream"
              : f.upstreamLikelihood === "low"
                ? "unlikely upstream"
                : "unknown";
        console.log(
          `  ${statusIcon} ${f.id}-${f.slug}: effort=${f.effortScore.toFixed(1)}, ${upstreamLabel}`,
        );
      }
    }

    // Save to registry if requested
    if (flags.save) {
      const registry = loadRegistry();
      registry.forkHealthScore = analysis.healthScore;
      saveRegistry(registry);
      console.log("");
      console.log(ok("Health score saved to .relay/registry.json"));
    }

    console.log("");
  }
}
