import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Flags } from "@oclif/core";
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

export default class ProxyStart extends BaseCommand<typeof ProxyStart> {
  static description = "Start the relay proxy server";

  static examples = [
    "<%= config.bin %> proxy start",
    "<%= config.bin %> proxy start --port 8787",
    "<%= config.bin %> proxy start --foreground",
  ];

  static flags = {
    port: Flags.integer({
      char: "p",
      description: "Port to listen on",
      default: 8787,
    }),
    foreground: Flags.boolean({
      char: "f",
      description: "Run in foreground (don't detach)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ProxyStart);

    // Check if already running
    if (existsSync(PID_FILE)) {
      try {
        const pid = Number(readFileSync(PID_FILE, "utf-8").trim());
        if (isRunning(pid)) {
          await this.renderApp(
            <Box>
              <Text color="yellow">
                Proxy already running (pid {pid}). Run 'relay proxy stop' first.
              </Text>
            </Box>,
          );
          return;
        }
      } catch {}
    }

    const serverScript = new URL("../../proxy/server.js", import.meta.url)
      .pathname;

    if (flags.foreground) {
      // Run in foreground — useful for debugging
      await this.renderApp(
        <Box>
          <Text>Starting proxy on port {flags.port} (foreground)...</Text>
        </Box>,
      );
      const proc = Bun.spawn([process.execPath, serverScript], {
        env: { ...process.env, RELAY_PROXY_PORT: String(flags.port) },
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
      return;
    }

    // Detached background process
    const child = Bun.spawn([process.execPath, serverScript], {
      env: { ...process.env, RELAY_PROXY_PORT: String(flags.port) },
      stdout: null,
      stderr: null,
      stdin: null,
    });

    // Give it a moment to start and write PID
    await Bun.sleep(300);

    // Verify it started
    let started = false;
    try {
      const res = await fetch(`http://127.0.0.1:${flags.port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      started = res.ok;
    } catch {}

    child.unref();

    if (started) {
      await this.renderApp(
        <Box flexDirection="column">
          <Text color="green">✓ Relay proxy started on port {flags.port}</Text>
          <Text color="dim">
            ANTHROPIC_BASE_URL=http://127.0.0.1:{flags.port}/api/anthropic
          </Text>
          <Text color="dim">Log: ~/.claude/relay-proxy.log</Text>
        </Box>,
      );
    } else {
      await this.renderApp(
        <Box>
          <Text color="red">
            Failed to start proxy. Check ~/.claude/relay-proxy.log for errors.
          </Text>
        </Box>,
      );
    }
  }
}
