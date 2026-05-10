import { getActiveAccount, listAccounts } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { bullet, bulletActive, bulletInactive, divider } from "../../utils/console";

export default class AccountList extends BaseCommand<typeof AccountList> {
  static description = "List all accounts";

  async run(): Promise<void> {
    const accounts = listAccounts();
    const activeAccount = getActiveAccount();

    if (accounts.length === 0) {
      console.log("");
      console.log("No accounts configured. Run 'relay account add' to add one.");
      return;
    }

    console.log("");
    console.log("Accounts");
    console.log(divider());

    for (const acc of accounts) {
      const isActive = acc.id === activeAccount?.id;
      const marker = isActive ? bulletActive(acc.name) : bulletInactive(acc.name);
      console.log(`${marker} (${acc.provider}) — ${isActive ? "active" : acc.id}`);
    }

    console.log("");
    console.log(`${bullet(`Active account: ${activeAccount?.name ?? "none"}`)}`);
  }
}
