import { BaseCommand } from "../oclif/base";
import { divider, heading, dim } from "../utils/console";

export default class Help extends BaseCommand<typeof Help> {
  static description = "Show help information";
  static examples = ["<%= config.bin %> help"];

  async run(): Promise<void> {
    const pkg = await import("../../package.json");
    console.log("");
    console.log(heading(`RELAY - Multi-Provider AI API Proxy v${pkg.version}`));
    console.log("");
    console.log(divider("─", 50));
    console.log(heading("Commands:"));
    console.log("  account <cmd>  Multi-account management");
    console.log("  models [cmd]   List, add, or refresh provider models");
    console.log("  proxy <cmd>    AI API proxy server");
    console.log("  hooks <cmd>    Manage Claude Code and ForgeCode hooks");
    console.log("  auto <cmd>     Cross-provider auto-rotation");
    console.log("  doctor         Diagnose configuration issues");
    console.log("  usage [opts]   Show usage for active/all accounts");
    console.log("  analytics      Show telemetry summary");
    console.log("  help           Show this help message");
    console.log("  version        Show version");
    console.log("");
    console.log(dim("  For more info: https://github.com/ImBIOS/relay"));
  }
}
