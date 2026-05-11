import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import {
  loadRegistry,
  loadUpstreamConfig,
  listPatches,
} from "./core";
import { createFeaturePR, createUpstreamPR } from "./pr";
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

export default class PatchCreatePR extends BaseCommand<typeof PatchCreatePR> {
  static description = "Create per-feature PRs on the fork and/or upstream repo";

  static flags = {
    feature: Flags.string({
      description: "Feature slug, or 'all' to create PRs for all features",
      default: "all",
    }),
    "fork-pr": Flags.boolean({
      description: "Create PR on the fork for each feature branch",
      default: false,
    }),
    "upstream-issue": Flags.boolean({
      description: "Create issue on upstream repo for each feature",
      default: false,
    }),
    "upstream-pr": Flags.boolean({
      description: "Create PR on upstream repo for each feature",
      default: false,
    }),
    base: Flags.string({
      description: "Base branch for fork PRs",
      default: "main",
    }),
    dryRun: Flags.boolean({
      description: "Show what would be created without making changes",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchCreatePR);
    const config = loadUpstreamConfig();
    const registry = loadRegistry();
    const patches = listPatches();

    console.log("");
    console.log(heading("relay patch create-pr"));
    console.log(divider());
    console.log(bullet(`Feature: ${flags.feature}`));
    console.log(bullet(`Fork PR: ${flags["fork-pr"] ? "yes" : "no"}`));
    console.log(bullet(`Upstream Issue: ${flags["upstream-issue"] ? "yes" : "no"}`));
    console.log(bullet(`Upstream PR: ${flags["upstream-pr"] ? "yes" : "no"}`));
    if (!config?.upstream && (flags["upstream-issue"] || flags["upstream-pr"])) {
      console.log(warn("No upstream configured. Upstream PRs/issues skipped."));
    }
    console.log("");

    if (patches.length === 0) {
      console.log(ok("No patches found."));
      return;
    }

    const targets =
      flags.feature === "all"
        ? registry.features.filter((f) => f.hasPatch || patches.includes(`${f.id}-${f.slug}`))
        : registry.features.filter(
            (f) =>
              f.id === flags.feature ||
              f.slug === flags.feature ||
              `${f.id}-${f.slug}` === flags.feature,
          );

    if (targets.length === 0) {
      console.log(warn("No matching features found."));
      return;
    }

    let forkPRs = 0;
    let upstreamIssues = 0;
    let upstreamPRs = 0;
    let errors = 0;

    for (const feature of targets) {
      const slug = `${feature.id}-${feature.slug}`;
      console.log(dim(`Processing: ${slug}`));

      // Fork PR
      if (flags["fork-pr"]) {
        const result = await createFeaturePR(feature, {
          baseBranch: flags.base,
          dryRun: flags.dryRun,
        });
        if (result.prUrl) {
          console.log(success(`  Fork PR: ${result.prUrl}`));
          forkPRs++;
        } else if (result.error) {
          console.log(errIcon(`  Fork PR failed: ${result.error}`));
          errors++;
        }
      }

      // Upstream issue / PR
      if (flags["upstream-issue"] || flags["upstream-pr"]) {
        const result = await createUpstreamPR(feature, {
          dryRun: flags.dryRun,
          createPR: flags["upstream-pr"],
        });
        if (result.upstreamIssueUrl) {
          console.log(success(`  Upstream Issue: ${result.upstreamIssueUrl}`));
          upstreamIssues++;
        }
        if (result.upstreamPRUrl) {
          console.log(success(`  Upstream PR: ${result.upstreamPRUrl}`));
          upstreamPRs++;
        }
        if (result.error) {
          console.log(errIcon(`  Upstream failed: ${result.error}`));
          errors++;
        }
      }
    }

    console.log("");
    console.log(divider());
    console.log(heading("Summary:"));
    if (flags["fork-pr"]) console.log(success(`${forkPRs} fork PR(s) created`));
    if (flags["upstream-issue"]) console.log(success(`${upstreamIssues} upstream issue(s) created`));
    if (flags["upstream-pr"]) console.log(success(`${upstreamPRs} upstream PR(s) created`));
    if (errors > 0) console.log(errIcon(`${errors} error(s)`));
    console.log("");
  }
}