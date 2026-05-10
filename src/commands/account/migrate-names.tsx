import { isCancel, text } from "@clack/prompts";
import { loadConfig, saveConfig } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { divider, heading, ok, warn } from "../../utils/console";
import { isValidEmail } from "../../utils/validate";

export default class AccountMigrateNames extends BaseCommand<typeof AccountMigrateNames> {
  static description = "Migrate existing account names to email format";
  static examples = ["<%= config.bin %> account migrate-names"];

  async run(): Promise<void> {
    const config = loadConfig();
    const accounts = Object.values(config.accounts);

    const needsMigration = accounts.filter((a) => !isValidEmail(a.name));

    if (needsMigration.length === 0) {
      console.log("");
      console.log(heading("Account Name Migration"));
      console.log(divider());
      console.log(`  ${ok("All account names are already in email format.")}`);
      return;
    }

    console.log("");
    console.log(heading("Account Name Migration"));
    console.log(divider());
    console.log(`  ${ok(`${needsMigration.length} account(s) need migration.`)}`);
    console.log("");

    let migrated = 0;
    for (const account of needsMigration) {
      const newName = await text({
        message: `  ${account.name} (${account.provider}):`,
        placeholder: "user@example.com",
        validate: (value: string | undefined) => {
          if (!value?.trim()) return "Email cannot be empty";
          if (!isValidEmail(value)) return "Must be a valid email address";
          return;
        },
      });

      if (isCancel(newName)) {
        console.log(`\n  ${warn("Migration cancelled.")}`);
        return;
      }

      config.accounts[account.id]!.name = newName as string;
      console.log(`  ${ok("✓")} ${account.name} → ${newName}`);
      migrated++;
    }

    saveConfig(config);
    console.log("");
    console.log(`  ${ok(`Migrated ${migrated} account(s) successfully.`)}`);
  }
}