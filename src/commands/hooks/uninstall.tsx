// @ts-nocheck
import { BaseCommand } from "../../oclif/base";
import { saveSettings } from "../../config/settings";
import { divider, ok, success, warn } from "../../utils/console";

export default class HooksUninstall extends BaseCommand<typeof HooksUninstall> {
  static description = "Uninstall Claude Code lifecycle hooks";

  async run(): Promise<void> {
    console.log("");
    console.log("  Uninstalling Claude Code Hooks");
    console.log(divider("─", 40));

    try {
      saveSettings({
        claude: {
          enabled: false,
          settings: {
            "session-start": "",
            "post-tool-use": "",
            stop: "",
          },
        },
      });

      console.log(`  ${ok("OK")} session-start → removed`);
      console.log(`  ${ok("OK")} post-tool-use → removed`);
      console.log(`  ${ok("OK")} stop           → removed`);
      console.log("");
      console.log(success("  Hooks uninstalled."));
    } catch (e) {
      console.log(`  ${warn("Warning:")} Could not update settings: ${e}`);
    }
  }
}
