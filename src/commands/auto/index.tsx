import { BaseCommand } from "../../oclif/base";
import { divider, heading, item, subheading } from "../../utils/console";

export default class Auto extends BaseCommand<typeof Auto> {
  static description = "Cross-provider auto-rotation";
  static examples = [
    "<%= config.bin %> auto enable round-robin",
    "<%= config.bin %> auto status",
    "<%= config.bin %> auto rotate",
  ];

  async run(): Promise<void> {
    console.log("");
    console.log(heading("ImBIOS Auto-Rotation"));
    console.log(divider("─", 50));
    console.log(subheading("Commands:"));
    console.log(`  ${item("enable [strategy]")} Enable auto-rotation`);
    console.log(`  ${item("disable")}           Disable auto-rotation`);
    console.log(`  ${item("status")}             Show current rotation status`);
    console.log(`  ${item("rotate")}              Manually trigger rotation`);
    console.log("");
    console.log(subheading("Strategies:"));
    console.log("  least-used   Pick account with lowest usage (default)");
    console.log("  round-robin  Cycle through accounts sequentially");
    console.log("  random       Randomly select account");
  }
}
