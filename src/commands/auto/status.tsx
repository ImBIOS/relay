import { BaseCommand } from "../../oclif/base";
import { loadConfig } from "../../config/accounts-config";
import { ok, warn, dim } from "../../utils/console";

export default class AutoStatus extends BaseCommand<typeof AutoStatus> {
  static description = "Show auto-rotation status";

  async run(): Promise<void> {
    const config = loadConfig();
    const rot = config.rotation;
    const filterLabel = rot.providerFilter === "selected-providers" && rot.allowedProviders.length > 0
      ? `${rot.providerFilter} (${rot.allowedProviders.join(", ")})`
      : rot.providerFilter;
    console.log("");
    console.log("  Auto Rotation");
    console.log(`  ${rot.enabled ? ok("Enabled") : warn("Disabled")} — strategy: ${rot.strategy}, filter: ${filterLabel}`);
    if (rot.allowedProviders.length > 0) {
      console.log(`  ${dim(`Allowed providers: ${rot.allowedProviders.join(", ")}`)}`);
    }
  }
}
