import { BaseCommand } from "../oclif/base";
import { Flags } from "@oclif/core";
import { loadConfig } from "../config/accounts-config";
import { zaiProvider } from "../providers/zai";
import { minimaxProvider } from "../providers/minimax";
import { copilotProvider } from "../providers/copilot";
import { cursorProvider } from "../providers/cursor";
import type { Provider } from "../providers/base";
import { formatNumber, formatResetsAt, formatResetAtAbsolute } from "../utils/format";
import { dim, warn } from "../utils/console";
import { getProviderCliLabel } from "../config/provider-registry";

const PROVIDERS: Record<string, Provider> = {
  zai: zaiProvider,
  minimax: minimaxProvider,
  copilot: copilotProvider,
  cursor: cursorProvider,
};

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

    const provider = PROVIDERS[active.provider];
    if (!provider) {
      console.error(`Unknown provider: ${active.provider}`);
      this.exit(1);
    }
    console.log(`\n  ${active.name} — ${provider.displayName}`);
    console.log(`  ${dim("Loading usage...")}`);

    const stats = await provider.getUsage({
      apiKey: active.apiKey,
      groupId: active.groupId,
      oauthToken: active.oauthToken,
    });

    console.log(`  ${dim("Provider:")} ${active.provider}`);

    if (active.provider === "copilot") {
      // Copilot-specific display
      if (stats.copilotPlan) {
        console.log(`  ${dim("Plan:")} ${stats.copilotPlan}`);
      }
      if (stats.limit > 0) {
        console.log(
          `  ${dim("Premium Interactions:")} ${formatNumber(stats.used)} / ${formatNumber(stats.limit)}`,
        );
        console.log(
          `  ${dim("Remaining:")} ${formatNumber(stats.remaining)} (${stats.percentUsed.toFixed(1)}% used)`,
        );
      } else {
        console.log(`  ${dim("Premium Interactions:")} Unlimited`);
      }
      if (stats.copilotChat) {
        const chatStatus = stats.copilotChat.unlimited
          ? "unlimited"
          : `${stats.copilotChat.percentRemaining.toFixed(1)}% remaining`;
        console.log(`  ${dim("Chat:")} ${chatStatus}`);
      }
      if (stats.copilotCompletions) {
        const compStatus = stats.copilotCompletions.unlimited
          ? "unlimited"
          : `${stats.copilotCompletions.percentRemaining.toFixed(1)}% remaining`;
        console.log(`  ${dim("Completions:")} ${compStatus}`);
      }
      if (stats.resetsAt) {
        const absolute = formatResetAtAbsolute(stats.resetsAt);
        const relative = formatResetsAt(stats.resetsAt);
        console.log(`  ${dim("Resets At:")} ${absolute} (${relative})`);
      }
    } else if (active.provider === "cursor") {
      // Cursor-specific display
      if (stats.membershipType) {
        console.log(`  ${dim("Plan:")} ${stats.membershipType}`);
      }
      if (stats.isUnlimited) {
        console.log(`  ${dim("Usage:")} Unlimited`);
      } else if (stats.limit > 0) {
        console.log(
          `  ${dim("Usage:")} ${formatNumber(stats.used)} / ${formatNumber(stats.limit)} (${stats.percentUsed.toFixed(1)}% used)`,
        );
        console.log(`  ${dim("Remaining:")} ${formatNumber(stats.remaining)}`);
      } else if (stats.percentUsed > 0) {
        console.log(`  ${dim("Usage:")} ${stats.percentUsed.toFixed(1)}% used`);
      }
      if (stats.autoPercentUsed !== undefined) {
        console.log(`  ${dim("Auto Usage:")} ${stats.autoPercentUsed.toFixed(1)}%`);
      }
      if (stats.apiPercentUsed !== undefined) {
        console.log(`  ${dim("API Usage:")} ${stats.apiPercentUsed.toFixed(1)}%`);
      }
      if (stats.resetsAt) {
        const absolute = formatResetAtAbsolute(stats.resetsAt);
        const relative = formatResetsAt(stats.resetsAt);
        console.log(`  ${dim("Resets At:")} ${absolute} (${relative})`);
      }
      if (!stats.percentUsed && !stats.remaining && !stats.limit) {
        console.log("");
        console.log(warn("  No usage data available. Check your session token."));
      }
    } else {
      // ZAI / MiniMax display
      if (stats.intervalPercentageOnly) {
        // MiniMax new API shape: only the remaining percentage is exposed for the 5-hour window.
        // Don't fabricate absolute counts.
        if (typeof stats.percentUsed === "number")
          console.log(`  ${dim("Usage:")} ${stats.percentUsed.toFixed(1)}% used`);
        if (typeof stats.percentRemaining === "number")
          console.log(`  ${dim("Remaining:")} ${stats.percentRemaining.toFixed(1)}%`);
      } else {
        console.log(`  ${dim("Used:")} ${formatNumber(stats.used)}`);
        console.log(`  ${dim("Limit:")} ${formatNumber(stats.limit)}`);
        console.log(`  ${dim("Remaining:")} ${formatNumber(stats.remaining)}`);
        if (stats.percentUsed !== undefined)
          console.log(`  ${dim("Usage:")} ${stats.percentUsed.toFixed(1)}%`);
      }
      if (stats.resetsAt) {
        const absolute = formatResetAtAbsolute(stats.resetsAt);
        const relative = formatResetsAt(stats.resetsAt);
        console.log(`  ${dim("Resets At:")} ${absolute} (${relative})`);
      }
      if (stats.weeklyUsage) {
        const weeklyReset = stats.weeklyUsage.resetsAt
          ? `${formatResetAtAbsolute(stats.weeklyUsage.resetsAt)} (${formatResetsAt(stats.weeklyUsage.resetsAt)})`
          : "N/A";
        if (stats.weeklyUsage.unlimited) {
          console.log(`  ${dim("Weekly:")} Unlimited · resets ${weeklyReset}`);
        } else {
          const weeklyPct = stats.weeklyUsage.percentUsed?.toFixed(1) ?? "0.0";
          const weeklyUsed = formatNumber(stats.weeklyUsage.used);
          const weeklyLimit = formatNumber(stats.weeklyUsage.limit);
          console.log(
            `  ${dim("Weekly:")} ${weeklyUsed} / ${weeklyLimit} · ${weeklyPct}% · resets ${weeklyReset}`,
          );
        }
      }

      if (active.groupId) console.log(`  ${dim("GroupId:")} ${active.groupId}`);

      if (!stats.remaining && !stats.limit) {
        console.log("");
        console.log(warn("  No usage data available. Check your API key."));
      }
    }

    if (flags.json) {
      console.log(
        JSON.stringify({ account: active.name, provider: active.provider, usage: stats }, null, 2),
      );
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

    // Fetch all accounts in parallel for better performance
    const results = await Promise.all(
      accounts.map(async (account, index) => {
        const provider = PROVIDERS[account.provider];
        if (!provider) return null;

        if (account.provider === "copilot") {
          const stats = await provider.getUsage({
            apiKey: account.apiKey,
            oauthToken: account.oauthToken,
          });
          return {
            account,
            providerLabel: getProviderCliLabel(account.provider),
            stats,
            displayType: "copilot" as const,
            index: index + 1,
          };
        }

        if (account.provider === "cursor") {
          const stats = await provider.getUsage({ apiKey: account.apiKey });
          return {
            account,
            providerLabel: getProviderCliLabel(account.provider),
            stats,
            displayType: "cursor" as const,
            index: index + 1,
          };
        }

        const stats = await provider.getUsage({ apiKey: account.apiKey, groupId: account.groupId });
        return {
          account,
          providerLabel: getProviderCliLabel(account.provider),
          stats,
          displayType: "default" as const,
          index: index + 1,
        };
      }),
    );

    for (const result of results) {
      if (!result) continue;

      const { account, providerLabel, stats, displayType, index } = result;

      if (displayType === "copilot") {
        console.log(`\n  [${index}] ${account.name}`);
        console.log(`  ${providerLabel}`);
        if (stats.copilotPlan) {
          console.log(`  Plan: ${stats.copilotPlan}`);
        }
        if (stats.limit > 0) {
          const pct = stats.percentUsed.toFixed(1);
          console.log(
            `  Premium: ${formatNumber(stats.used)} / ${formatNumber(stats.limit)} · ${pct}% used`,
          );
        } else {
          console.log(`  Premium: Unlimited`);
        }
        if (stats.resetsAt) {
          const absolute = formatResetAtAbsolute(stats.resetsAt);
          const relative = formatResetsAt(stats.resetsAt);
          console.log(`  Resets at ${absolute} (${relative})`);
        }
        continue;
      }

      if (displayType === "cursor") {
        console.log(`\n  [${index}] ${account.name}`);
        console.log(`  ${providerLabel}`);
        if (stats.membershipType) {
          console.log(`  Plan: ${stats.membershipType}`);
        }
        if (stats.isUnlimited) {
          console.log(`  Usage: Unlimited`);
        } else if (stats.limit > 0) {
          const pct = stats.percentUsed.toFixed(1);
          console.log(
            `  Usage: ${formatNumber(stats.used)} / ${formatNumber(stats.limit)} · ${pct}% used`,
          );
        } else if (stats.percentUsed > 0) {
          console.log(`  Usage: ${stats.percentUsed.toFixed(1)}% used`);
        }
        if (stats.resetsAt) {
          const absolute = formatResetAtAbsolute(stats.resetsAt);
          const relative = formatResetsAt(stats.resetsAt);
          console.log(`  Resets at ${absolute} (${relative})`);
        }
        continue;
      }

      const resetAbsolute = formatResetAtAbsolute(stats.resetsAt ?? undefined);
      const resetRelative = formatResetsAt(stats.resetsAt ?? undefined);
      const pct = stats.percentUsed?.toFixed(1) ?? "0.0";
      const used = formatNumber(stats.used);
      const limit = formatNumber(stats.limit);

      console.log(`\n  [${index}] ${account.name}`);
      console.log(`    ${providerLabel}`);
      if (stats.intervalPercentageOnly) {
        // MiniMax new API: only the remaining percentage is exposed for the 5-hour window.
        const remainingPct = stats.percentRemaining?.toFixed(1) ?? "100.0";
        console.log(`  ${pct}% used · ${remainingPct}% remaining`);
      } else {
        console.log(`  ${used} / ${limit} · ${pct}% used`);
      }
      console.log(`  Resets at ${resetAbsolute} (${resetRelative})`);

      if (stats.weeklyUsage) {
        const weeklyPct = stats.weeklyUsage.percentUsed?.toFixed(1) ?? "0.0";
        const weeklyUsed = formatNumber(stats.weeklyUsage.used);
        const weeklyLimit = formatNumber(stats.weeklyUsage.limit);
        const weeklyResetAbsolute = formatResetAtAbsolute(stats.weeklyUsage.resetsAt ?? undefined);
        const weeklyResetRelative = formatResetsAt(stats.weeklyUsage.resetsAt ?? undefined);
        if (stats.weeklyUsage.unlimited) {
          console.log(
            `  Weekly: Unlimited · resets ${weeklyResetAbsolute} (${weeklyResetRelative})`,
          );
        } else {
          console.log(
            `  Weekly: ${weeklyUsed} / ${weeklyLimit} · ${weeklyPct}% · resets ${weeklyResetAbsolute} (${weeklyResetRelative})`,
          );
        }
      }
    }
  }
}
