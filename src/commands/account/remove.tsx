import { BaseCommand } from "../../oclif/base";
import { deleteAccount } from "../../config/accounts-config";
import { divider, error, ok } from "../../utils/console";

export default class AccountRemove extends BaseCommand<typeof AccountRemove> {
  static description = "Remove a provider account";
  static examples = [
    "<%= config.bin %> account remove acc_xxx",
  ];
  // Use non-strict mode to allow account IDs that look like flags to pass through
  static strict = false;

  async run(): Promise<void> {
    const accountId = this.argv?.[0] as string | undefined;

    if (!accountId) {
      console.error(error("Usage: relay account remove <account-id>"));
      console.error("Run 'relay account list' to see account IDs.");
      this.exit(1);
    }

    const deleted = deleteAccount(accountId);
    if (!deleted) {
      console.error(error(`Account not found: ${accountId}`));
      console.error("Run 'relay account list' to see account IDs.");
      this.exit(1);
    }

    console.log("");
    console.log(ok(`Removed account: ${deleted.name} (${deleted.provider})`));
    console.log(divider("─", 50));
  }
}
