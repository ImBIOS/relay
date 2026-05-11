import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { runConflictAudit, createConflictAuditIssue, buildHealthDashboard } from "./pr";
import { saveRegistry, loadRegistry } from "./core";
import {
  divider,
  ok,
  heading,
  dim,
  bullet,
  success,
  error as errIcon,
  bgRed,
  bgYellow,
} from "../../utils/console";

export default class PatchAudit extends BaseCommand<typeof PatchAudit> {
  static description = "Run conflict audit for all patches and generate reports";

  static flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
    "create-issue": Flags.boolean({
      description: "Create a GitHub issue with the conflict audit results",
      default: false,
    }),
    dashboard: Flags.boolean({
      description: "Output health dashboard markdown",
      default: false,
    }),
    "save-score": Flags.boolean({
      description: "Save health score to registry",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchAudit);

    console.log("");
    console.log(heading("relay patch audit"));
    console.log(divider());

    // Run conflict audit
    const audits = await runConflictAudit();

    // Output dashboard
    if (flags.dashboard) {
      console.log(buildHealthDashboard());
      return;
    }

    if (flags.json) {
      console.log(JSON.stringify({ audits, dashboard: buildHealthDashboard() }, null, 2));
      return;
    }

    // Summarize audits
    const total = audits.length;
    const conflicted = audits.filter((a) => a.hasConflict).length;
    const manual = audits.filter((a) => a.suggestedAction === "manual").length;
    const retire = audits.filter((a) => a.suggestedAction === "retire").length;
    const reapply = audits.filter((a) => a.suggestedAction === "reapply").length;

    console.log(heading("Audit Results:"));
    console.log(bullet(`Total patches: ${total}`));
    console.log(bullet(`Conflicts: ${conflicted}`));
    console.log(bullet(`  → Re-apply: ${reapply}`));
    console.log(bullet(`  → Manual review: ${manual}`));
    console.log(bullet(`  → Retire: ${retire}`));
    console.log("");

    // Detailed conflict list
    const conflictAudits = audits.filter((a) => a.hasConflict);
    if (conflictAudits.length > 0) {
      console.log(divider());
      console.log(heading("Conflicts Detail:"));

      for (const audit of conflictAudits) {
        const color =
          audit.suggestedAction === "retire"
            ? bgRed
            : audit.suggestedAction === "manual"
              ? bgYellow
              : (s: string) => s;

        console.log(
          `  ${color(audit.suggestedAction.toUpperCase())} ${audit.featureSlug}`,
        );

        if (audit.conflictFiles.length > 0) {
          console.log(`    ${dim("Files: " + audit.conflictFiles.join(", "))}`);
        }

        if (audit.conflictDetails) {
          const firstLine = audit.conflictDetails.trim().split("\n")[0];
          console.log(`    ${dim(firstLine?.slice(0, 100))}`);
        }
      }
      console.log("");
    }

    // Create GitHub issue if requested
    if (flags["create-issue"] && conflictAudits.length > 0) {
      console.log(divider());
      const issueUrl = await createConflictAuditIssue(conflictAudits);
      if (issueUrl) {
        console.log(success(`Conflict audit issue created: ${issueUrl}`));
      } else {
        console.log(errIcon("Failed to create conflict audit issue"));
      }
    }

    // Save health score
    if (flags["save-score"]) {
      const registry = loadRegistry();
      // Compute health score from audit
      const healthScore = Math.max(0, 100 - conflicted * 15 - manual * 10 - retire * 20);
      registry.forkHealthScore = healthScore;
      saveRegistry(registry);
      console.log(ok(`Health score saved: ${healthScore}/100`));
    }

    console.log("");
  }
}