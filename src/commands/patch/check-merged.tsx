import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  loadRegistry,
  saveRegistry,
  upsertFeature,
} from "./core";
import type { FeatureEntry } from "./types";
import { createUpstreamPR } from "./pr";
import {
  divider,
  ok,
  warn,
  heading,
  dim,
  bullet,
  success,
} from "../../utils/console";

export default class PatchCheckMerged extends BaseCommand<typeof PatchCheckMerged> {
  static description = "Check if upstream has merged any tracked patches and clean up";

  static flags = {
    feature: Flags.string({
      description: "Feature slug to check, or 'all'",
      default: "all",
    }),
    "create-pr": Flags.boolean({
      description: "Create upstream PRs for features that only have issues",
      default: false,
    }),
    "create-issue": Flags.boolean({
      description: "Create upstream issues for features that don't have one",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchCheckMerged);

    console.log("");
    console.log(heading("relay patch check-merged"));
    console.log(divider());

    const registry = loadRegistry();

    if (registry.features.length === 0) {
      console.log(ok("No features registered."));
      return;
    }

    const targets =
      flags.feature === "all"
        ? registry.features.filter((f) => f.hasPatch || f.upstreamIssue)
        : registry.features.filter(
            (f) =>
              f.id === flags.feature ||
              f.slug === flags.feature ||
              `${f.id}-${f.slug}` === flags.feature,
          );

    if (targets.length === 0) {
      console.log(warn(`No matching features found.`));
      return;
    }

    let cleanedUp = 0;
    let stillPending = 0;
    let partialMerges = 0;
    let prsCreated = 0;
    let issuesCreated = 0;

    for (const feature of targets) {
      const slug = `${feature.id}-${feature.slug}`;
      console.log(dim(`Checking: ${slug}...`));

      // Create upstream issue if missing and --create-issue is set
      if (!feature.upstreamIssue && flags["create-issue"]) {
        console.log(dim(`  Creating upstream issue for ${slug}...`));
        const result = await createUpstreamPR(feature, {
          dryRun: false,
          createPR: false,
        });
        if (result.upstreamIssueUrl) {
          console.log(success(`  Created upstream issue: ${result.upstreamIssueUrl}`));
          issuesCreated++;
        } else if (result.error) {
          console.log(warn(`  Failed to create issue: ${result.error}`));
        }
        // Reload registry since createUpstreamPR may have updated it
        continue;
      }

      // Create upstream PR if only issue exists and --create-pr is set
      if (feature.upstreamIssue && !feature.upstreamPR && flags["create-pr"]) {
        const branchName = `feature/${slug}`;
        console.log(dim(`  Creating upstream PR from ${branchName}...`));
        const result = await createUpstreamPR(feature, {
          dryRun: false,
          createPR: true,
          forkBranch: branchName,
        });
        if (result.upstreamPRUrl) {
          console.log(success(`  Created upstream PR: ${result.upstreamPRUrl}`));
          prsCreated++;
        } else if (result.error) {
          console.log(warn(`  Failed to create PR: ${result.error}`));
        }
        continue;
      }

      if (!feature.upstreamIssue) {
        console.log(bullet(`No upstream issue configured. Skipping.`));
        continue;
      }

      // Check upstream issue state
      const issueState = await getIssueState(feature.upstreamIssue);
      if (!issueState) {
        console.log(warn(`Could not check upstream issue: ${feature.upstreamIssue}`));
        continue;
      }

      if (issueState === "OPEN") {
        console.log(bullet(`Issue still open: ${feature.upstreamIssue}`));
        feature.lastSynced = new Date().toISOString();
        stillPending++;
        continue;
      }

      // Issue is closed — check if PR was merged
      if (feature.upstreamPR) {
        const prState = await getPRState(feature.upstreamPR);
        if (prState === "MERGED") {
          console.log(success(`PR merged! Cleaning up: ${slug}`));
          await retireFeature(feature, "Merged via PR: " + feature.upstreamPR);
          cleanedUp++;
        } else if (prState === "CLOSED") {
          console.log(warn(`PR closed without merge: ${feature.upstreamPR}`));
          // PR was rejected — mark as needs-review
          feature.status = "partial";
          feature.notes = `Upstream PR ${feature.upstreamPR} was closed without merge.`;
          partialMerges++;
        } else {
          console.log(bullet(`PR still open: ${feature.upstreamPR}`));
          feature.lastSynced = new Date().toISOString();
          stillPending++;
        }
      } else {
        // Issue closed but no PR — could mean it was implemented differently
        console.log(success(`Issue closed (no PR). Cleaning up: ${slug}`));
        await retireFeature(feature, "Issue closed: " + feature.upstreamIssue);
        cleanedUp++;
      }

      upsertFeature(registry, feature);
    }

    registry.lastSync = new Date().toISOString();
    saveRegistry(registry);

    // Summary
    console.log("");
    console.log(divider());
    console.log(heading("Summary:"));
    console.log(success(`${cleanedUp} patches retired (merged upstream)`));
    if (stillPending > 0) {
      console.log(bullet(`${stillPending} still pending upstream`));
    }
    if (partialMerges > 0) {
      console.log(warn(`${partialMerges} need review (partial/rejected)`));
    }
    if (issuesCreated > 0) {
      console.log(success(`${issuesCreated} upstream issues created`));
    }
    if (prsCreated > 0) {
      console.log(success(`${prsCreated} upstream PRs created`));
    }
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// GitHub API helpers (use gh CLI)
// ---------------------------------------------------------------------------

async function getIssueState(issueUrl: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["gh", "issue", "view", issueUrl, "--json", "state", "-q", ".state"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: process.cwd(),
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    const stdout = await new Response(proc.stdout).text();
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getPRState(prUrl: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(
      ["gh", "pr", "view", prUrl, "--json", "state,mergedAt", "-q", ".state"],
      {
        stdout: "pipe",
        stderr: "pipe",
        cwd: process.cwd(),
      },
    );
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    const stdout = await new Response(proc.stdout).text();
    const state = stdout.trim();
    if (state === "CLOSED") {
      // Check if it was actually merged
      const proc2 = Bun.spawn(
        ["gh", "pr", "view", prUrl, "--json", "mergedAt", "-q", ".mergedAt"],
        {
          stdout: "pipe",
          stderr: "pipe",
          cwd: process.cwd(),
        },
      );
      const mergedAt = await new Response(proc2.stdout).text();
      if (mergedAt.trim() && mergedAt.trim() !== "null") {
        return "MERGED";
      }
    }
    return state || null;
  } catch {
    return null;
  }
}

async function retireFeature(feature: FeatureEntry, reason: string): Promise<void> {
  const slug = `${feature.id}-${feature.slug}`;
  const patchPath = join(".relay", "features", slug, "patch.md");

  // Remove patch file
  if (existsSync(patchPath)) {
    rmSync(patchPath);
  }

  // Remove conflict file if present
  const conflictPath = join(".relay", "features", slug, "conflict.md");
  if (existsSync(conflictPath)) {
    rmSync(conflictPath);
  }

  // Update feature entry
  feature.hasPatch = false;
  feature.status = "retired";
  feature.notes = reason;
  feature.upstreamIssue = undefined;
  feature.upstreamPR = undefined;

  // Post thank-you comment on upstream issue
  if (feature.upstreamIssue) {
    try {
      Bun.spawn(
        [
          "gh",
          "issue",
          "comment",
          feature.upstreamIssue,
          "--body",
          "Thank you for addressing this! The fork patch has been cleaned up automatically by Relay Patch.",
        ],
        { stdout: "pipe", stderr: "pipe", cwd: process.cwd() },
      );
    } catch {
      // Non-critical
    }
  }
}
