import * as os from "node:os";
import * as path from "node:path";
import { Args } from "@oclif/core";
import { Box } from "ink";
import * as accountsConfig from "../config/accounts-config";
import { BaseCommand } from "../oclif/base";
import { Error as ErrorBadge, Info, Section, Success } from "../ui/index";

export default class Rotate extends BaseCommand<typeof Rotate> {
  static description = "Rotate to next API key for a provider";
  static examples = ["<%= config.bin %> rotate zai", "<%= config.bin %> rotate minimax"];

  static args = {
    provider: Args.string({
      description: "Provider to rotate (zai or minimax)",
      required: true,
      options: ["zai", "minimax"],
    }),
  };

  async run(): Promise<void> {
    const provider = this.args.provider as "zai" | "minimax";

    if (!["zai", "minimax"].includes(provider)) {
      await this.renderApp(
        <Box>
          <ErrorBadge>Usage: relay rotate &lt;zai|minimax&gt;</ErrorBadge>
        </Box>,
      );
      return;
    }

    const newAccount = accountsConfig.rotateApiKey(provider);

    if (newAccount) {
      // Update settings.json with new account credentials
      const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
      if (require("node:fs").existsSync(settingsPath)) {
        try {
          const settingsContent = require("node:fs").readFileSync(settingsPath, "utf-8");
          const settings = JSON.parse(settingsContent);

          // Build environment - only disable non-essential traffic for MiniMax
          const env: Record<string, string | number> = {
            ANTHROPIC_AUTH_TOKEN: newAccount.apiKey,
            ANTHROPIC_BASE_URL: newAccount.baseUrl,
            API_TIMEOUT_MS: "3000000",
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
          };

          settings.env = env;
          require("node:fs").writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch {
          // Silently fail if settings update fails
        }
      }

      await this.renderApp(
        <Section title="API Key Rotation">
          <Box flexDirection="column">
            <Success>Rotated to account: {newAccount.name}</Success>
            <Info>
              New active account: {newAccount.name} ({newAccount.provider})
            </Info>
          </Box>
        </Section>,
      );
    } else {
      await this.renderApp(
        <Section title="API Key Rotation">
          <Box flexDirection="column">
            <ErrorBadge>No other accounts available for {provider}.</ErrorBadge>
            <Info>Add more accounts with: relay account add</Info>
          </Box>
        </Section>,
      );
    }
  }
}
