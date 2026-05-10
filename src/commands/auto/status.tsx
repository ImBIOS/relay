import { BaseCommand } from "../../oclif/base";
import { loadConfig } from "../../config/accounts-config";
import { ok, warn } from "../../utils/console";

export default class AutoStatus extends BaseCommand<typeof AutoStatus> {
  static description = "Show auto-rotation status";

  async run(): Promise<void> {
    const config = loadConfig();
    const rot = config.rotation;
    console.log("");
    console.log("  Auto Rotation");
    console.log(`  ${rot.enabled ? ok("Enabled") : warn("Disabled")} — strategy: ${rot.strategy}`);
  }
}
