import { BaseCommand } from "../../oclif/base";
import { divider, heading, item, ok, subheading } from "../../utils/console";

export default class HooksIndex extends BaseCommand<typeof HooksIndex> {
  static description = "Manage hooks for Claude Code and ForgeCode";
  static examples = [
    "<%= config.bin %> hooks setup",
    "<%= config.bin %> hooks uninstall",
    "<%= config.bin %> hooks status",
    "<%= config.bin %> hooks post-tool",
    "<%= config.bin %> hooks stop",
    "<%= config.bin %> hooks forge-setup",
    "<%= config.bin %> hooks forge-stop",
    "<%= config.bin %> hooks codex-setup",
    "<%= config.bin %> hooks codex-stop",
  ];

  async run(): Promise<void> {
    console.log("");
    console.log(heading("Hooks Management"));
    console.log(divider("─", 50));
    console.log(subheading("Claude Code:"));
    console.log(`  ${item("setup")}    Install Claude Code hooks globally`);
    console.log(`  ${item("uninstall")} Remove Claude Code hooks`);
    console.log(`  ${item("status")}    Check Claude Code hook status`);
    console.log(`  ${item("post-tool")} Format files after Write|Edit`);
    console.log(`  ${item("stop")}      Session end notifications + commit prompt`);
    console.log("");
    console.log(subheading("ForgeCode:"));
    console.log(`  ${item("forge-setup")} Install shell wrapper for auto-commit`);
    console.log(`  ${item("forge-stop")}   Auto-commit after forge session ends`);
    console.log("");
    console.log(subheading("Codex CLI:"));
    console.log(`  ${item("codex-setup")} Install shell wrapper + config for Codex CLI`);
    console.log(`  ${item("codex-stop")}   Session end hook for Codex CLI`);
    console.log("");
    console.log(subheading("ForgeCode Provider:"));
    console.log(`  ${item("forge register")}   Register Relay as a ForgeCode provider`);
    console.log(`  ${item("forge status")}     Check provider registration status`);
    console.log(`  ${item("forge unregister")} Remove Relay provider from ForgeCode`);
    console.log("");
    console.log(ok("Hooks enable auto-rotation, formatting, and commit prompts."));
    console.log("  For notifications, we recommend peon-ping instead.");
  }
}
