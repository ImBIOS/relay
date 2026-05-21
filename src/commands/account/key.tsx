import { BaseCommand } from "../../oclif/base";
import { Args } from "@oclif/core";
import { listAccounts } from "../../config/accounts-config";
import { warn } from "../../utils/console";

export default class AccountKey extends BaseCommand<typeof AccountKey> {
  static description = "Print the API key for an account by number";
  static args = {
    number: Args.string({
      required: true,
      description: "Account number (from `relay usage --all`)",
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(AccountKey);
    const num = parseInt(args.number, 10);

    if (isNaN(num) || num < 1) {
      console.error(warn(`  Invalid account number: ${args.number}. Use a positive number (e.g., 1, 2, 3).`));
      this.exit(1);
    }

    const accounts = listAccounts();

    if (num > accounts.length) {
      console.error(warn(`  Account [${num}] not found. Run 'relay usage --all' to see available accounts.`));
      this.exit(1);
    }

    const account = accounts[num - 1];

    if (account.provider === "copilot" && account.oauthToken) {
      console.log(account.oauthToken);
    } else {
      console.log(account.apiKey);
    }
  }
}