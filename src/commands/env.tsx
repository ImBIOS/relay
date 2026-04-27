import { Args } from "@oclif/core";
import { Box, Text } from "ink";
import type React from "react";
import { getActiveAccount } from "../config/accounts-config";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

function getProviderFactory(provider: string): (() => Provider) | null {
  return PROVIDERS[provider] ?? null;
}

export default class Env extends BaseCommand<typeof Env> {
  static description = "Export environment variables";
  static examples = ["<%= config.bin %> env export", 'eval "$(<%= config.bin %> env export)"'];

  static args = {
    action: Args.string({
      description: "Action to perform",
      required: false,
      options: ["export"],
    }),
  };

  async run(): Promise<void> {
    const action = this.args.action;

    if (action === "export") {
      const activeAccount = getActiveAccount();
      const activeProvider = activeAccount?.provider ?? settings.getActiveProvider();
      const providerFactory = getProviderFactory(activeProvider);

      if (!providerFactory) {
        throw new Error(`Unsupported active provider \"${activeProvider}\".`);
      }

      const provider = providerFactory();
      const config = activeAccount
        ? {
            apiKey: activeAccount.apiKey,
            baseUrl: activeAccount.baseUrl,
          }
        : provider.getConfig();

      const envScript = `# relay Environment Variables\n${activeAccount ? `# Active account: ${activeAccount.name} (${activeAccount.provider})\n` : ""}export ANTHROPIC_AUTH_TOKEN="${config.apiKey}"\nexport ANTHROPIC_BASE_URL="${config.baseUrl}"\n# ANTHROPIC_MODEL is NOT set - providers handle translation\nexport API_TIMEOUT_MS=3000000\n`;
      // Use console.log for raw output (for eval)
      console.log(envScript);
    } else {
      await this.renderApp(<EnvUsage />);
    }
  }
}

function EnvUsage(): React.ReactElement {
  return (
    <Box>
      <Text>Usage: eval "$(relay env export)"</Text>
    </Box>
  );
}
