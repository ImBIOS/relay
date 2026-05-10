import { BaseCommand } from "../../oclif/base";
import { readTelemetry } from "../../utils/telemetry";
import { divider, error } from "../../utils/console";

export default class Analytics extends BaseCommand<typeof Analytics> {
  static description = "Show usage analytics from telemetry";

  async run(): Promise<void> {
    console.log("");
    console.log("  Relay Analytics");
    console.log(divider("─", 40));

    try {
      const events = readTelemetry();
      if (events.length === 0) {
        console.log("");
        console.log("  No telemetry data yet.");
        return;
      }

      const byCmd = new Map<string, number>();
      for (const e of events) {
        byCmd.set(e.command, (byCmd.get(e.command) ?? 0) + 1);
      }

      const sorted = [...byCmd.entries()].sort((a, b) => b[1] - a[1]);
      const total = sorted.reduce((s, [, c]) => s + c, 0);

      console.log(`\n  Total events: ${total}`);
      console.log(
        `  Time range:   ${events[0]?.timestamp ?? "?"} → ${events.at(-1)?.timestamp ?? "?"}`,
      );
      console.log("\n  Top commands:");
      for (const [cmd, count] of sorted.slice(0, 10)) {
        const pct = ((count / total) * 100).toFixed(1);
        console.log(`    ${count.toString().padStart(6)}  ${pct}%  ${cmd}`);
      }
    } catch (e) {
      console.log(`  ${error("Error:")} ${String(e)}`);
    }
  }
}
