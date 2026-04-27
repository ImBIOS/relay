import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Box, Text } from "ink";
import { getActiveAccount } from "../../config/accounts-config.js";
import { BaseCommand } from "../../oclif/base.js";

const PID_FILE = join(homedir(), ".claude", "relay-proxy.pid");
const LOG_FILE = join(homedir(), ".claude", "relay-proxy.log");

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

interface HealthData {
  status: string;
  activeAccount: string | null;
  activeProvider: string | null;
  port: number;
}

interface LogEntry {
  ts: string;
  method?: string;
  path?: string;
  model?: string;
  provider?: string;
  account?: string;
  status?: number;
  latency_ms?: number;
  error?: string;
}

export default class ProxyStatus extends BaseCommand<typeof ProxyStatus> {
  static description = "Show relay proxy server status";

  static examples = ["<%= config.bin %> proxy status"];

  async run(): Promise<void> {
    let pid: number | null = null;
    let running = false;
    let port = 8787;
    let health: HealthData | null = null;

    if (existsSync(PID_FILE)) {
      try {
        pid = Number(readFileSync(PID_FILE, "utf-8").trim());
        running = isRunning(pid);
      } catch {}
    }

    if (running) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok) {
          health = (await res.json()) as HealthData;
          port = health.port;
        }
      } catch {}
    }

    // Read last 5 log lines
    let recentLogs: LogEntry[] = [];
    if (existsSync(LOG_FILE)) {
      try {
        const lines = readFileSync(LOG_FILE, "utf-8").trim().split("\n").filter(Boolean);
        recentLogs = lines
          .slice(-5)
          .map((l) => {
            try {
              return JSON.parse(l) as LogEntry;
            } catch {
              return null;
            }
          })
          .filter((x): x is LogEntry => x !== null);
      } catch {}
    }

    const active = getActiveAccount();

    await this.renderApp(
      <Box flexDirection="column" gap={1}>
        <Box gap={2}>
          <Text bold>Proxy:</Text>
          <Text color={running ? "green" : "red"}>
            {running ? `running` : "stopped"}
            {pid !== null ? ` (pid ${pid})` : ""}
          </Text>
        </Box>

        {running && (
          <Box gap={2}>
            <Text bold>Endpoint:</Text>
            <Text>http://127.0.0.1:{port}/api/anthropic</Text>
          </Box>
        )}

        <Box gap={2}>
          <Text bold>Active account:</Text>
          <Text color={active ? "cyan" : "yellow"}>
            {active ? `${active.name} (${active.provider})` : "none configured"}
          </Text>
        </Box>

        {recentLogs.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Recent requests:</Text>
            {recentLogs.map((entry, i) => (
              <Box key={i} gap={1}>
                <Text color="dim">{entry.ts?.slice(11, 19)}</Text>
                {entry.error ? (
                  <Text color="red">ERROR: {entry.error}</Text>
                ) : (
                  <>
                    <Text color={entry.status && entry.status < 400 ? "green" : "red"}>
                      {entry.status}
                    </Text>
                    <Text>
                      {entry.method} {entry.path}
                    </Text>
                    <Text color="dim">model={entry.model}</Text>
                    <Text color="dim">→{entry.provider}</Text>
                    <Text color="dim">{entry.latency_ms}ms</Text>
                  </>
                )}
              </Box>
            ))}
          </Box>
        )}

        {!running && <Text color="dim">Run 'relay proxy start' to start the proxy.</Text>}
      </Box>,
    );
  }
}
