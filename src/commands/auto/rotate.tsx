import { Flags } from "@oclif/core";
import { Box } from "ink";
import { rotateAcrossProviders } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Success } from "../../ui/index";

export default class AutoRotate extends BaseCommand<typeof AutoRotate> {
  static description = "Manually trigger rotation";
  static examples = ["<%= config.bin %> auto rotate", "<%= config.bin %> auto rotate --silent"];

  static flags = {
    silent: Flags.boolean({
      description: "Silent mode (no output, useful for hooks)",
      default: false,
    }),
    json: Flags.boolean({
      description: "Output as JSON (useful for scripts)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { account: newAccount, rotated } = await rotateAcrossProviders();

    if (this.flags.json) {
      if (newAccount) {
        console.log(
          JSON.stringify({
            success: true,
            rotated,
            account: {
              id: newAccount.id,
              name: newAccount.name,
              provider: newAccount.provider,
              apiKey: newAccount.apiKey,
              baseUrl: newAccount.baseUrl,
            },
          }),
        );
      } else {
        console.log(JSON.stringify({ success: false, error: "No accounts available" }));
      }
      return;
    }

    if (this.flags.silent) {
      return;
    }

    if (newAccount) {
      await this.renderApp(
        <Box>
          <Success>
            {rotated ? "Rotated to" : "Using"}: {newAccount.name} ({newAccount.provider})
          </Success>
        </Box>,
      );
    } else {
      await this.renderApp(
        <Box>
          <ErrorBadge>No accounts available for rotation.</ErrorBadge>
        </Box>,
      );
    }
  }
}
