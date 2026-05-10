import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { loadConfig } from "../../config/accounts-config";
import { zaiProvider } from "../../providers/zai";
import { minimaxProvider } from "../../providers/minimax";
import { formatNumber, formatResetsAt } from "../../utils/format";
import { dim, warn } from "../../utils/console";

export default class Usage extends BaseCommand<typeof Usage> {
  static description = "Show usage for the active account";
  static flags = { json: Flags.boolean({ default: false }) };

  async run(): Promise<void> {
    const { flags } = await this.parse(Usage);
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
    if (stats.groupId) console.log(`  ${dim("GroupId:")} ${stats.groupId}`);

    if (!stats.remaining && !stats.limit) {
      console.log("");
      console.log(warn("  No usage data available. Check your API key."));
    }

    if (flags.json) {
      console.log(JSON.stringify({ account: active.name, provider: active.provider, usage: stats }, null, 2));
    }
  }
}
