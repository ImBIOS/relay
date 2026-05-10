// @ts-nocheck
import { BaseCommand } from "../../oclif/base";
import { loadSettings } from "../../config/settings";
import { divider, ok, warn } from "../../utils/console";

export default class HooksStatus extends BaseCommand<typeof HooksStatus> {
  static description = "Check which Claude Code hooks are installed";

  async run(): Promise<void> {
    console.log("");
    console.log("  Claude Code Hooks");
    console.log(divider("─", 40));

    try {
      const settings = loadSettings();
      const hooks = settings.claude?.settings ?? {};

      const check = (name: string, key: string) => {
        const cmd = hooks[key];
        if (cmd) {
          console.log(`  ${ok("INSTALLED")} ${name}`);
          console.log(`    Command: ${cmd}`);
        } else {
          console.log(`  ${warn("NOT SET")}   ${name}`);
        }
      };

      check("SessionStart", "session-start");
      check("PostToolUse", "post-tool-use");
      check("Stop", "stop");
      console.log("");
    } catch {
      console.log(`  ${warn("No settings file found.")}`);
      console.log("  Run `relay hooks install` to set up Claude Code hooks.");
    }
  }
}
