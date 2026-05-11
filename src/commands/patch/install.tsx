import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ensureRelayDir,
  saveUpstreamConfig,
  saveRegistry,
  loadUpstreamConfig,
  loadRegistry,
  WORKFLOWS_DIR,
} from "./core";
import type { UpstreamConfig } from "./types";
import {
  divider,
  ok,
  success,
  heading,
  bullet,
} from "../../utils/console";

const FORK_SYNC_WORKFLOW = `name: Fork Sync

on:
  workflow_dispatch:
    inputs:
      upstream-ref:
        description: "Upstream ref to sync to (branch, tag, or commit)"
        required: false
        default: ""
  schedule:
    - cron: "0 6 * * *"

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  sync:
    runs-on: ubuntu-latest
    outputs:
      has_changes: \${{ steps.sync.outputs.has_changes }}
      has_conflicts: \${{ steps.sync.outputs.has_conflicts }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Read config
        id: config
        run: |
          if [ ! -f .relay/upstream.json ]; then
            echo "No .relay/upstream.json found."
            exit 0
          fi
          echo "upstream=$(jq -r '.upstream // empty' .relay/upstream.json)" >> "$GITHUB_OUTPUT"
          echo "branch=$(jq -r '.upstreamBranch // "main"' .relay/upstream.json)" >> "$GITHUB_OUTPUT"
          echo "strategy=$(jq -r '.conflictStrategy // "attempt-rebase"' .relay/upstream.json)" >> "$GITHUB_OUTPUT"

      - name: Detect upstream
        id: detect
        if: steps.config.outputs.upstream == ''
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          IS_FORK=$(gh repo view --json isFork -q '.isFork')
          if [ "$IS_FORK" = "true" ]; then
            PARENT=$(gh repo view --json parent -q '.parent.owner.login + "/" + .parent.name')
            echo "upstream=$PARENT" >> "$GITHUB_OUTPUT"
          else
            echo "Not a fork and no upstream configured. Skipping."
            exit 0
          fi

      - name: Sync upstream
        id: sync
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          STRATEGY: \${{ steps.config.outputs.strategy }}
        run: |
          UPSTREAM="\${{ steps.config.outputs.upstream || steps.detect.outputs.upstream }}"
          BRANCH="\${{ steps.config.outputs.branch }}"
          REF="\${{ github.event.inputs.upstream-ref || format('refs/heads/{0}', BRANCH) }}"

          git config user.name "fork-sync[bot]"
          git config user.email "fork-sync[bot]@users.noreply.github.com"

          git remote add upstream "https://github.com/\${UPSTREAM}.git" || true
          git fetch upstream

          BEHIND=$(git rev-list HEAD.."\${REF}" --count)
          echo "behind=$BEHIND" >> "$GITHUB_OUTPUT"

          if [ "$BEHIND" -eq 0 ]; then
            echo "Already up to date."
            echo "has_changes=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          echo "has_changes=true" >> "$GITHUB_OUTPUT"
          SYNC_BRANCH="sync/upstream-$(date +%Y%m%d-%H%M%S)"
          git checkout -b "$SYNC_BRANCH"

          if [ "$STRATEGY" = "attempt-rebase" ]; then
            git rebase "\${REF}" || {
              git rebase --abort
              git merge "\${REF}" --no-edit || echo "has_conflicts=true" >> "$GITHUB_OUTPUT"
            }
          else
            git merge "\${REF}" --no-edit || echo "has_conflicts=true" >> "$GITHUB_OUTPUT"
          fi

          git push origin "$SYNC_BRANCH"

          UPSTREAM_COMMIT=$(git rev-parse "$REF")
          gh pr create \\
            --title "sync: upstream \${UPSTREAM_COMMIT:0:7} ($BEHIND commits)" \\
            --body "Automated sync with upstream. After merge, relay-patch will re-apply active patches." \\
            --base "\${{ github.ref_name }}" \\
            --head "$SYNC_BRANCH" \\
            --label "automated,fork-sync" || true

      - name: Trigger patch re-apply
        if: steps.sync.outputs.has_changes == 'true'
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          gh workflow run relay-patch.yml --field feature=all || echo "Could not trigger patch workflow"
`;

const RELAY_PATCH_WORKFLOW = `name: Relay Patch

on:
  workflow_dispatch:
    inputs:
      action:
        description: "Action to perform"
        required: false
        default: "apply"
        type: choice
        options:
          - apply
          - check-merged
          - analyze
      feature:
        description: "Feature slug or 'all'"
        required: false
        default: "all"
      dry-run:
        description: "Dry run"
        type: boolean
        default: false
  schedule:
    - cron: "0 7 * * *"

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  apply-patches:
    if: github.event.inputs.action == 'apply' || github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2

      - name: Install relay
        run: |
          if command -v relay &>/dev/null; then
            echo "relay already installed"
          else
            bun install -g github:ImBIOS/relay || bun install -g ./submodules/relay
          fi

      - name: Apply patches
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          FEATURE="\${{ github.event.inputs.feature || 'all' }}"
          DRY_RUN="\${{ github.event.inputs.dry-run || 'false' }}"

          if [ "$DRY_RUN" = "true" ]; then
            bun src/run.ts patch apply --feature "$FEATURE" --dry-run
          else
            bun src/run.ts patch apply --feature "$FEATURE"
          fi

      - name: Commit changes
        run: |
          git config user.name "relay-patch[bot]"
          git config user.email "relay-patch[bot]@users.noreply.github.com"
          git add -A
          git diff --cached --quiet || git commit -m "chore: apply relay patches [skip ci]"
          git push

  check-merged:
    if: github.event.inputs.action == 'check-merged'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Check merged
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: bun src/run.ts patch check-merged
      - name: Commit cleanup
        run: |
          git config user.name "relay-patch[bot]"
          git config user.email "relay-patch[bot]@users.noreply.github.com"
          git add -A
          git diff --cached --quiet || git commit -m "chore: clean up merged upstream patches [skip ci]"
          git push

  analyze:
    if: github.event.inputs.action == 'analyze'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Run analysis
        run: bun src/run.ts patch analyze
`;

const RELAY_QA_WORKFLOW = `name: Relay QA

on:
  push:
    branches: [main]
    paths:
      - "src/**"
      - ".relay/**"
  pull_request:
    branches: [main]
    paths:
      - "src/**"
      - ".relay/**"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Validate patches
        run: bun src/run.ts patch validate
      - name: Run tests
        run: |
          bun install
          bun test
`;

export default class PatchInstall extends BaseCommand<typeof PatchInstall> {
  static description = "Initialize Relay Patch in a forked repository";

  static flags = {
    upstream: Flags.string({
      description: "Upstream repo in owner/repo format (auto-detected for forks)",
    }),
    branch: Flags.string({
      description: "Upstream branch to sync from",
      default: "main",
    }),
    "no-ai": Flags.boolean({
      description: "Disable AI-powered patch re-application",
      default: false,
    }),
    "no-workflows": Flags.boolean({
      description: "Skip workflow file installation",
      default: false,
    }),
    force: Flags.boolean({
      description: "Overwrite existing config",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PatchInstall);

    console.log("");
    console.log(heading("relay patch install"));
    console.log(divider());

    // Check if already initialized
    const existing = loadUpstreamConfig();
    if (existing && !flags.force) {
      console.log(ok("Already initialized. Use --force to reconfigure."));
      console.log(`  Upstream: ${existing.upstream ?? "(auto-detect)"}`);
      console.log(`  Branch: ${existing.upstreamBranch}`);
      return;
    }

    // Ensure directory structure
    ensureRelayDir();

    // Build config
    const config: UpstreamConfig = {
      enabled: true,
      upstream: flags.upstream,
      upstreamBranch: flags.branch,
      conflictStrategy: "attempt-rebase",
      reapplyPatches: true,
      manageUpstreamIssues: true,
      createUpstreamPRs: true,
      aiReapply: !flags["no-ai"],
      aiModel: "claude-sonnet-4-20250514",
      aiMaxTurns: 30,
    };

    saveUpstreamConfig(config);
    console.log(success("Created .relay/upstream.json"));

    // Initialize registry if needed
    const registry = loadRegistry();
    if (registry.features.length === 0) {
      saveRegistry({ version: 1, features: [] });
      console.log(success("Created .relay/registry.json"));
    }

    // Install workflow files
    if (!flags["no-workflows"]) {
      if (!existsSync(WORKFLOWS_DIR)) {
        mkdirSync(WORKFLOWS_DIR, { recursive: true });
      }

      const workflowFiles = [
        { name: "fork-sync.yml", content: FORK_SYNC_WORKFLOW },
        { name: "relay-patch.yml", content: RELAY_PATCH_WORKFLOW },
        { name: "relay-qa.yml", content: RELAY_QA_WORKFLOW },
      ];

      for (const wf of workflowFiles) {
        const path = join(WORKFLOWS_DIR, wf.name);
        if (existsSync(path) && !flags.force) {
          console.log(bullet(`Skipping ${wf.name} (already exists, use --force to overwrite)`));
        } else {
          writeFileSync(path, wf.content, "utf-8");
          console.log(success(`Installed .github/workflows/${wf.name}`));
        }
      }
    }

    console.log("");
    console.log(divider());
    console.log(heading("Next steps:"));
    console.log(bullet("Create a feature: mkdir -p .relay/features/001-my-feature"));
    console.log(bullet("Write a patch:   echo '## Intent\\n...' > .relay/features/001-my-feature/patch.md"));
    console.log(bullet("Register it:     relay patch apply --feature 001-my-feature"));
    console.log(bullet("Check status:    relay patch status"));
    console.log("");
  }
}
