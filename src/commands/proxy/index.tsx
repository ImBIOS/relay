import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base.js";

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

    await this.renderApp(
      <Box flexDirection="column" gap={1}>
        <Text bold>relay proxy</Text>
        <Text>
          Routes Claude Code API calls through a local proxy to Z.AI/MiniMax.
        </Text>
        <Text>
          Status:{" "}
          <Text color={running ? "green" : "yellow"}>
            {running ? `running (pid ${pid})` : "stopped"}
          </Text>
        </Text>
        <Text> </Text>
        <Text bold>Commands:</Text>
        <Text>  relay proxy start   Start the proxy server (port 8787)</Text>
        <Text>  relay proxy stop    Stop the proxy server</Text>
        <Text>  relay proxy status  Show proxy status and recent logs</Text>
        <Text> </Text>
        <Text bold>Claude Code settings:</Text>
        <Text>  ANTHROPIC_BASE_URL=http://127.0.0.1:8787/api/anthropic</Text>
        <Text>  ANTHROPIC_AUTH_TOKEN={"<any non-empty string>"}</Text>
      </Box>,
    );
  }
}
