import { BaseCommand } from "../../oclif/base";
import { divider, heading, item, subheading } from "../../utils/console";

export default class Account extends BaseCommand<typeof Account> {
  static description = "Multi-account management";
  static examples = [
    "<%= config.bin %> account list",
    "<%= config.bin %> account add",
    "<%= config.bin %> account edit <id>",
    "<%= config.bin %> account switch acc_123",
  ];

  async run(): Promise<void> {
    console.log("");
    console.log(heading("ImBIOS Multi-Account Management"));
    console.log(divider("─", 50));
    console.log(subheading("Commands:"));
    console.log(`  ${item("list")}       List all accounts`);
    console.log(`  ${item("add")}        Add a new account`);
    console.log(`  ${item("edit <id>")}  Edit an existing account`);
    console.log(`  ${item("switch <id>")} Switch to an account`);
    console.log(`  ${item("remove <id>")} Remove an account`);
    console.log(`  ${item("migrate-names")} Migrate existing names to email format`);
    console.log("");
    console.log(subheading("Edit flags:"));
    console.log("  --name <value>   Account name (must be email address)");
    console.log("  --api-key <val>  API key");
    console.log("  --group-id <val>  Group ID (MiniMax only)");
    console.log("  --base-url <url> Base URL");
  }
}
