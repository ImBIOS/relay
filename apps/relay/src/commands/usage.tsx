import { Flags } from "@oclif/core";
import { Box } from "ink";
import type React from "react";
import { getActiveAccount, listAccounts } from "../config/accounts-config";
import { BaseCommand } from "../oclif/base";
import type { Provider, UsageStats } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import { Info, Section, Table, Warning } from "../ui/index";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class Usage extends BaseCommand<typeof Usage> {
  static description = "Query quota and usage statistics";
  static examples = [
    "<%= config.bin %> usage",
    "<%= config.bin %> usage --verbose",
    "<%= config.bin %> usage --all",
    "<%= config.bin %> usage --json",
    "<%= config.bin %> usage --all --json",
  ];

  static flags = {
    verbose: Flags.boolean({
      description: "Show detailed usage information",
      default: false,
    }),
    all: Flags.boolean({
      description: "Show usage for all accounts",
      default: false,
    }),
    json: Flags.boolean({
      description: "Output usage data as JSON",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Usage);

    // Use v2 accounts config
    const accounts = listAccounts();

    if (flags.all) {
      // Fetch usage for all accounts
      const accountsWithUsage = await Promise.all(
        accounts.map(async (account) => {
          const provider = PROVIDERS[account.provider]();
          const usage = await provider.getUsage({
            apiKey: account.apiKey,
            groupId: account.groupId,
          });
          return { account, provider: provider.displayName, usage };
        })
      );

      // JSON output
      if (flags.json) {
        console.log(
          JSON.stringify(
            accountsWithUsage.map(
              ({ account, provider: prov, usage: usg }) => ({
                id: account.id,
                name: account.name,
                provider: prov,
                ...usg,
              })
            ),
            null,
            2
          )
        );
        return;
      }

      await this.renderApp(
        <Box flexDirection="column">
          <Section title="Usage for All Accounts">
            {accountsWithUsage.map(
              ({ account, provider: prov, usage: usg }) =>
                usg && (
                  <AccountUsageItem
                    key={account.id}
                    name={account.name}
                    provider={prov}
                    usage={usg}
                  />
                )
            )}
          </Section>
        </Box>
      );
      return;
    }

    // Show usage for active account only
    const activeAccount = getActiveAccount();

    if (!activeAccount) {
      if (flags.json) {
        console.error("No active account configured. Run 'relay config' first.");
        return;
      }
      await this.renderApp(
        <Warning>
          No active account configured. Run "relay config" first.
        </Warning>
      );
      return;
    }

    const provider = PROVIDERS[activeAccount.provider]();

    // Get usage for the active account
    const usage = await provider.getUsage({
      apiKey: activeAccount.apiKey,
      groupId: activeAccount.groupId,
    });

    // JSON output
    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            id: activeAccount.id,
            name: activeAccount.name,
            provider: provider.displayName,
            ...usage,
          },
          null,
          2
        )
      );
      return;
    }

    const verbose = flags.verbose;

    await this.renderApp(
      <UsageUI
        provider={provider.displayName}
        usage={usage}
        verbose={verbose}
      />
    );
  }
}

interface UsageUIProps {
  provider: string;
  usage: UsageStats;
  verbose: boolean;
}

function UsageUI({
  provider,
  usage,
  verbose,
}: UsageUIProps): React.ReactElement {
  // Format number with K/M/B suffixes, no units
  const formatNumber = (num: number): string => {
    if (num === 0) return "0";
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const data: Record<string, string> = {
    Provider: provider,
    Used: formatNumber(usage.used),
    Limit: formatNumber(usage.limit),
    Remaining: formatNumber(usage.remaining),
    "Percent Used": `${usage.percentUsed.toFixed(1)}%`,
  };

  if (verbose) {
    if (usage.modelUsage) {
      data["Model Usage"] = formatNumber(usage.modelUsage.used);
    }
    if (usage.mcpUsage) {
      data["MCP Usage"] = formatNumber(usage.mcpUsage.used);
    }
  }

  return (
    <Section title="Usage Statistics">
      <Table data={data} />
      <Box marginTop={1}>
        <Info>
          {usage.percentUsed > 80
            ? "Warning: Usage is above 80%"
            : "Usage is within safe limits"}
        </Info>
      </Box>
    </Section>
  );
}

interface AccountUsageItemProps {
  name: string;
  provider: string;
  usage: UsageStats;
}

function AccountUsageItem({
  name,
  provider: prov,
  usage,
}: AccountUsageItemProps): React.ReactElement {
  // Format number with K/M/B suffixes, no units
  const formatNumber = (num: number): string => {
    if (num === 0) return "0";
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Info>{name}</Info>
        <Info> ({prov})</Info>
      </Box>
      <Box>
        <Info>
          {formatNumber(usage.used)} / {formatNumber(usage.limit)} (
          {usage.percentUsed.toFixed(1)}%)
        </Info>
      </Box>
    </Box>
  );
}
