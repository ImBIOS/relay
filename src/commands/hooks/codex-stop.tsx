import { Flags } from "@oclif/core";
import { BaseCommand } from "../../oclif/base";
import { ok } from "../../utils/console";

/**
 * Codex session end hook.
 *
 * Called from the shell wrapper's EXIT trap after `codex` exits.
 * Currently a lightweight stub — can be extended with auto-commit,
 * notifications, or usage tracking in the future.
 */
export default class CodexStop extends BaseCommand<typeof CodexStop> {
  static description = "Codex session end hook (called on EXIT trap)";
  static flags = {
    silent: Flags.boolean({ description: "Run silently", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CodexStop);
    if (flags.silent) return;

    console.log(`  ${ok("Codex session ended.")}`);
  }
}
