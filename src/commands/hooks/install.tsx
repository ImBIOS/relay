// @ts-nocheck
import { BaseCommand } from "../../oclif/base";
import { saveSettings } from "../../config/settings";
import { divider, ok, success } from "../../utils/console";

export default class HooksInstall extends BaseCommand<typeof HooksInstall> {
  static description = "Install Claude Code lifecycle hooks for relay";

  async run(): Promise<void> {
    console.log("");
    console.log("  Installing Claude Code Hooks");
    console.log(divider("─", 40));

    try {
      saveSettings({
        claude: {
          enabled: true,
          settings: {
            "session-start": "relay hooks session-start --silent",
            "post-tool-use": "relay hooks post-tool --silent",
            stop: "relay hooks stop --silent",
          },
        },
      });

      console.log(`  ${ok("OK")} session-start → relay hooks session-start --silent`);
      console.log(`  ${ok("OK")} post-tool-use → relay hooks post-tool --silent`);
      console.log(`  ${ok("OK")} stop           → relay hooks stop --silent`);
      console.log("");
      console.log(success("  Hooks installed. Restart Claude Code to activate."));
    } catch (e) {
      console.log("");
      console.error(`  Failed to install hooks: ${e}`);
      this.exit(1);
    }
  }
}
