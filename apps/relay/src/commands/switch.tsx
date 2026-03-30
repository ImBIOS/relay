import { Args } from "@oclif/core";
import { Box } from "ink";
import type React from "react";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import { Error as ErrorBadge, Success, Warning } from "../ui/index";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class Switch extends BaseCommand<typeof Switch> {
  static description = "Switch active provider";
  static examples = [
    "<%= config.bin %> switch zai",
    "<%= config.bin %> switch minimax",
  ];

  static args = {
    provider: Args.string({
      description: "Provider to switch to (zai or minimax)",
      required: true,
      options: ["zai", "minimax"],
    }),
  };

  async run(): Promise<void> {
    const targetProvider = this.args.provider as "zai" | "minimax";

    if (!["zai", "minimax"].includes(targetProvider)) {
      await this.renderApp(
        <Box>
          <ErrorBadge>Usage: relay switch &lt;zai|minimax&gt;</ErrorBadge>
        </Box>
      );
      return;
    }

    const provider = PROVIDERS[targetProvider]();
    const config = provider.getConfig();

    if (!config.apiKey) {
      await this.renderApp(
        <Box>
          <Warning>
            {provider.displayName} is not configured. Run "relay config" first.
          </Warning>
        </Box>
      );
      return;
    }

    settings.setActiveProvider(targetProvider);

    await this.renderApp(<SwitchSuccess providerName={provider.displayName} />);
  }
}

interface SwitchSuccessProps {
  providerName: string;
}

function SwitchSuccess({
  providerName,
}: SwitchSuccessProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Success>Switched to {providerName}</Success>
    </Box>
  );
}
