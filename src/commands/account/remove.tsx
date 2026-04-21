import { Args } from "@oclif/core";
import { Box } from "ink";
import { deleteAccount } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Success } from "../../ui/index";

export default class AccountRemove extends BaseCommand<typeof AccountRemove> {
  static description = "Remove an account";
  static examples = ["<%= config.bin %> account remove acc_123456"];

  static args = {
    id: Args.string({
      description: "Account ID to remove",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const id = this.args.id;

    if (deleteAccount(id)) {
      await this.renderApp(
        <Box>
          <Success>Account {id} removed.</Success>
        </Box>
      );
    } else {
      await this.renderApp(
        <Box>
          <ErrorBadge>Failed to remove account "{id}".</ErrorBadge>
        </Box>
      );
    }
  }
}
