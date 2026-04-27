import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base.js";

const PID_FILE = join(homedir(), ".claude", "relay-proxy.pid");

export default class ProxyStop extends BaseCommand<typeof ProxyStop> {
  static description = "Stop the relay proxy server";

  static examples = ["<%= config.bin %> proxy stop"];

  async run(): Promise<void> {
    if (!existsSync(PID_FILE)) {
      await this.renderApp(
        <Box>
          <Text color="yellow">Proxy is not running (no PID file found).</Text>
        </Box>,
      );
      return;
    }

    let pid: number;
    try {
      pid = Number(readFileSync(PID_FILE, "utf-8").trim());
    } catch {
      await this.renderApp(
        <Box>
          <Text color="red">Failed to read PID file.</Text>
        </Box>,
      );
      return;
    }

    try {
      process.kill(pid, "SIGTERM");
      // Clean up PID file if process doesn't do it
      await Bun.sleep(300);
      if (existsSync(PID_FILE)) {
        unlinkSync(PID_FILE);
      }
      await this.renderApp(
        <Box>
          <Text color="green">✓ Relay proxy stopped (pid {pid}).</Text>
        </Box>,
      );
    } catch (err) {
      // Process already dead
      try {
        unlinkSync(PID_FILE);
      } catch {}
      await this.renderApp(
        <Box>
          <Text color="yellow">Proxy was not running (pid {pid} not found). Cleaned up.</Text>
        </Box>,
      );
    }
  }
}
