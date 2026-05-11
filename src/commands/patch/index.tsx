import { BaseCommand } from "../../oclif/base";
import { divider, heading, item, ok, subheading, warn } from "../../utils/console";
import { loadRegistry, loadUpstreamConfig, listPatches, listFeatures } from "./core";

export default class PatchIndex extends BaseCommand<typeof PatchIndex> {
  static description = "Manage fork patches — track, re-apply, and sync customizations with upstream";

  static examples = [
    "<%= config.bin %> patch install",
    "<%= config.bin %> patch status",
    "<%= config.bin %> patch apply",
    "<%= config.bin %> patch apply --feature 001-proxy",
    "<%= config.bin %> patch check-merged",
    "<%= config.bin %> patch analyze",
    "<%= config.bin %> patch validate",
  ];

  async run(): Promise<void> {
    const registry = loadRegistry();
    const config = loadUpstreamConfig();
    const patches = listPatches();
    const features = listFeatures();

    console.log("");
    console.log(heading("relay patch"));
    console.log("  Manage fork customizations and sync with upstream.");
    console.log("");

    if (config) {
      console.log(`  Upstream: ${config.upstream ?? "(auto-detect from fork)"}`);
      console.log(`  Branch:   ${config.upstreamBranch}`);
      console.log(`  AI re-apply: ${config.aiReapply ? "enabled" : "disabled"}`);
    } else {
      console.log(warn("Not configured. Run `relay patch install` to set up."));
    }

    console.log("");
    console.log(divider("─", 50));
    console.log(subheading("Features:"));
    console.log(`  ${patches.length} patches active, ${features.length} total features`);
    console.log("");

    if (registry.features.length > 0) {
      for (const f of registry.features.slice(0, 10)) {
        const statusIcon =
          f.status === "active"
            ? ok("")
            : f.status === "retired"
              ? "✓ "
              : f.status === "conflicted"
                ? warn("")
                : "○ ";
        console.log(`  ${statusIcon}${f.id}-${f.slug} (${f.status})`);
      }
      if (registry.features.length > 10) {
        console.log(`  ... and ${registry.features.length - 10} more`);
      }
    }

    console.log("");
    console.log(divider("─", 50));
    console.log(subheading("Commands:"));
    console.log(`  ${item("install")}       Initialize .relay/ config and workflow files`);
    console.log(`  ${item("status")}        Show patch status and health overview`);
    console.log(`  ${item("apply")}         Re-apply patches (AI-powered with forgecode-sdk)`);
    console.log(`  ${item("check-merged")}  Check if upstream has merged any patches`);
    console.log(`  ${item("analyze")}       Analyze fork health and recommend strategy`);
    console.log(`  ${item("validate")}      Validate all patch files for correctness`);
    console.log("");
  }
}
