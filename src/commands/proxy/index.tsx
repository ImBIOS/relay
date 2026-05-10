import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BaseCommand } from "../../oclif/base.js";
import { divider, dim, heading, item, ok, subheading, warn } from "../../utils/console";

const PID_FILE = join(homedir(), ".claude", "relay-proxy.pid");

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export default class Proxy extends BaseCommand<typeof Proxy> {
  static description = "Anthropic API proxy server (routes Claude Code → Z.AI/MiniMax)";

  static examples = [
    "<%= config.bin %> proxy start",
    "<%= config.bin %> proxy stop",
    "<%= config.bin %> proxy status",
  ];

  async run(): Promise<void> {
    let pid: number | null = null;
    let running = false;

    if (existsSync(PID_FILE)) {
      try {
        pid = Number(readFileSync(PID_FILE, "utf-8").trim());
        running = isRunning(pid);
      } catch {}
    }

    console.log("");
    console.log(heading("relay proxy"));
    console.log("  Routes Claude Code API calls through a local proxy to Z.AI/MiniMax.");
    console.log("");
    console.log(`  Status: ${running ? ok(`running (pid ${pid})`) : warn("stopped")}`);
    console.log("");
    console.log(divider("─", 50));
    console.log(subheading("Commands:"));
    console.log(`  ${item("start")}   Start the proxy server (port 8787)`);
    console.log(`  ${item("stop")}    Stop the proxy server`);
    console.log(`  ${item("status")}  Show proxy status and recent logs`);
    console.log("");
    console.log(divider("─", 50));
    console.log(subheading("Claude Code settings:"));
    console.log(dim("  ANTHROPIC_BASE_URL=http://127.0.0.1:8787/api/anthropic"));
    console.log(dim("  ANTHROPIC_AUTH_TOKEN=<any non-empty string>"));
  }
}
