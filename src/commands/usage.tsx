import { BaseCommand } from "../oclif/base";
import { Flags } from "@oclif/core";
import { loadConfig } from "../config/accounts-config";
import { zaiProvider } from "../providers/zai";
import { minimaxProvider } from "../providers/minimax";
import { formatNumber, formatResetsAt } from "../utils/format";
import { dim, warn } from "../utils/console";

export default class Usage extends BaseCommand<typeof Usage> {
  static description = "Show usage for the active account";
  static flags = {
    json: Flags.boolean({ default: false }),
    all: Flags.boolean({ default: false, description: "Show usage for all accounts" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Usage);

    if (flags.all) {
      await this.runAll();
      return;
    }

    const config = loadConfig();
    const active = config.accounts[config.activeAccountId ?? ""];

    if (!active) {
      console.error("No active account. Run `relay account add` first.");
      this.exit(1);
    }

    const provider = active.provider === "zai" ? zaiProvider : minimaxProvider;
    console.log(`\n  ${active.name} — ${provider.displayName}`);
    console.log(`  ${dim("Loading usage...")}`);

    const stats = await provider.getUsage({ apiKey: active.apiKey, groupId: active.groupId });

    console.log(`  ${dim("Provider:")} ${active.provider}`);
    console.log(`  ${dim("Used:")} ${formatNumber(stats.used)}`);
    console.log(`  ${dim("Limit:")} ${formatNumber(stats.limit)}`);
    console.log(`  ${dim("Remaining:")} ${formatNumber(stats.remaining)}`);
    if (stats.percentUsed !== undefined) {
      console.log(`  ${dim("Usage:")} ${stats.percentUsed.toFixed(1)}%`);
    }
    if (stats.resetsAt) {
      console.log(`  ${dim("Resets At:")} ${formatResetsAt(stats.resetsAt)}`);
      const left = stats.remaining;
      const h = Math.floor(left / 3600);
      const m = Math.floor((left % 3600) / 60);
      console.log(`  ${dim("Resets In:")} ${h > 0 ? `${h}h ` : ""}${m}m left`);
    }
    if (active.groupId) console.log(`  ${dim("GroupId:")} ${active.groupId}`);

    if (!stats.remaining && !stats.limit) {
      console.log("");
      console.log(warn("  No usage data available. Check your API key."));
    }

    if (flags.json) {
      console.log(JSON.stringify({ account: active.name, provider: active.provider, usage: stats }, null, 2));
    }
  }

  private async runAll(): Promise<void> {
    const config = loadConfig();
    const accounts = Object.values(config.accounts);

    if (accounts.length === 0) {
      console.log(warn("  No accounts configured. Run `relay account add` first."));
      return;
    }

    console.log("\n  Usage for All Accounts");
    console.log("  " + "─".repeat(50));

    const PROVIDERS = { zai: zaiProvider, minimax: minimaxProvider };

    for (const account of accounts) {
      const provider = PROVIDERS[account.provider];
      if (!provider) continue;

      const stats = await provider.getUsage({ apiKey: account.apiKey, groupId: account.groupId });
      const resetLocal = formatResetsAt(stats.resetsAt ?? "");
      const resetAbsolute = resetLocal.split(" (")[0] ?? "";
      const left = formatResetsAt(stats.resetsAt ?? "").match(/\((\d+h \d+m)\)/)?.[1] ?? "";
      const pct = stats.percentUsed?.toFixed(1) ?? "0.0";
      const used = formatNumber(stats.used);
      const limit = formatNumber(stats.limit);

      console.log(`\n  ${account.name}`);
      console.log(`  ${account.provider === "zai" ? "Z.AI" : "MiniMax"} — ${account.provider}`);
      console.log(`  ${used} / ${limit} tokens · ${pct}% used`);
      console.log(`  Resets at ${resetAbsolute}${left ? ` (${left})` : ""}`);
    }
  }
}
