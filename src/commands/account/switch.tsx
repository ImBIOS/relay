import { BaseCommand } from "../../oclif/base";
import { loadConfig, switchAccount } from "../../config/accounts-config";
import { error, success, warn } from "../../utils/console";

export default class AccountSwitch extends BaseCommand<typeof AccountSwitch> {
  static description = "Switch the active account";
  static examples = [
    "<%= config.bin %> account switch acc_xxx",
    "<%= config.bin %> account switch zai",
  ];
  // Use non-strict mode to allow account IDs that look like flags to pass through
  static strict = false;

  async run(): Promise<void> {
    const target = this.argv?.[0] as string | undefined;

    if (!target) {
      console.error(error("Usage: relay account switch <account-id-or-name>"));
      this.exit(1);
    }

    const config = loadConfig();
    const accounts = Object.values(config.accounts);
    const byId = accounts.find((a) => a.id === target);
    const byName = accounts.find((a) => a.name === target);

    if (byId || byName) {
      const id = byId?.id ?? byName?.id;
      const switched = switchAccount(id!);
      if (switched) {
        console.log("");
        console.log(success(`Switched to "${switched.name}" (${switched.provider}).`));
        return;
      }
    }

    const partial = accounts.filter(
      (a) =>
        a.name.toLowerCase().includes(target.toLowerCase()) ||
        a.provider.toLowerCase().includes(target.toLowerCase()),
    );

    if (partial.length === 1) {
      const switched = switchAccount(partial[0]!.id);
      if (switched) {
        console.log("");
        console.log(success(`Switched to "${switched.name}" (${switched.provider}).`));
        return;
      }
    }

    if (partial.length > 1) {
      console.log("");
      console.log(warn(`Multiple matches for "${target}":`));
      for (const acc of partial) {
        console.log(`  ${acc.id}  ${acc.name} (${acc.provider})`);
      }
      console.log("");
      console.log("Use the account ID for an exact match.");
      return;
    }

    console.error(error(`No account found matching: ${target}`));
    this.exit(1);
  }
}
