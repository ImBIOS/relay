import { Args } from "@oclif/core";
import { Box, Text } from "ink";
import type React from "react";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class Env extends BaseCommand<typeof Env> {
  static description = "Export environment variables";
  static examples = [
    "<%= config.bin %> env export",
    'eval "$(<%= config.bin %> env export)"',
  ];

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
      const activeProvider = settings.getActiveProvider();
      const provider = PROVIDERS[activeProvider]();
      const config = provider.getConfig();

      const envScript = `# ImBIOS Environment Variables
export ANTHROPIC_AUTH_TOKEN="${config.apiKey}"
export ANTHROPIC_BASE_URL="${config.baseUrl}"
# ANTHROPIC_MODEL is NOT set - providers handle translation
export API_TIMEOUT_MS=3000000
`;
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
