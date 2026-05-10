import * as accountsConfig from "../config/accounts-config";
import { BaseCommand } from "../oclif/base";
import { divider, heading, label, ok, warn } from "../utils/console";

export default class Status extends BaseCommand<typeof Status> {
  static description = "Show current provider and status";
  static examples = ["<%= config.bin %> status"];

  async run(): Promise<void> {
    const config = accountsConfig.loadConfig();
    const activeAccount = accountsConfig.getActiveAccount();
    const accounts = accountsConfig.listAccounts();

    console.log("");
    console.log(heading("RELAY Status"));
    console.log(divider("─", 50));

    if (activeAccount) {
      console.log(`  ${label("Active Account:")} ${activeAccount.name} (${activeAccount.provider})`);
    }

    console.log(`  ${label("Auto-rotation:")} ${config.rotation.enabled ? ok(config.rotation.strategy) : warn("disabled")}`);

    if (accounts.length > 0) {
      console.log("");
      console.log(divider("─", 50));
      console.log(heading("Accounts:"));
      for (const account of accounts) {
        const icon = account.id === activeAccount?.id ? ok("●") : " ";
        const keyMask = account.apiKey ? `••••${account.apiKey.slice(-4)}` : warn("no key");
        console.log(`  ${icon} ${account.name} (${account.provider}) — ${keyMask}`);
      }
    }
  }
}
