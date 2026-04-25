import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Flags } from "@oclif/core";
import * as accountsConfig from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";

const DEFAULT_PROXY_PORT = 8787;
const DEFAULT_PROXY_TOKEN = "relay";
const DEFAULT_OPUS_MODEL = "glm-5.1";
const DEFAULT_SONNET_MODEL = "glm-5-turbo";
const DEFAULT_HAIKU_MODEL = "MiniMax-M2.7";

function getHomeDir(): string {
  return process.env.HOME || homedir();
}

function getPidFilePath(homeDir = getHomeDir()): string {
  return join(homeDir, ".claude", "relay-proxy.pid");
}

function resolveProxyServerScriptPath(): string | null {
  for (const relativePath of ["../../proxy/server.ts", "../../proxy/server.js"]) {
    const candidatePath = fileURLToPath(new URL(relativePath, import.meta.url));
    if (existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getProxyPort(existingBaseUrl: unknown): number {
  const envPort = Number.parseInt(process.env.RELAY_PROXY_PORT ?? "", 10);
  if (Number.isInteger(envPort) && envPort > 0) {
    return envPort;
  }

  if (typeof existingBaseUrl === "string") {
    try {
      const url = new URL(existingBaseUrl);
      const isLocalHost =
        url.hostname === "127.0.0.1" || url.hostname.toLowerCase() === "localhost";
      if (isLocalHost && url.pathname.startsWith("/api/anthropic")) {
        const parsedPort = Number.parseInt(url.port || String(DEFAULT_PROXY_PORT), 10);
        if (Number.isInteger(parsedPort) && parsedPort > 0) {
          return parsedPort;
        }
      }
    } catch {
      // Ignore malformed URLs and fall back to the default port.
    }
  }

  return DEFAULT_PROXY_PORT;
}

function getProxyBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/anthropic`;
}

async function isProxyHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureRelayProxyRunning(
  port: number,
  silent: boolean,
): Promise<void> {
  if (await isProxyHealthy(port)) {
    return;
  }

  const pidFilePath = getPidFilePath();
  if (existsSync(pidFilePath)) {
    try {
      const pid = Number(readFileSync(pidFilePath, "utf-8").trim());
      if (isProcessRunning(pid)) {
        for (let attempt = 0; attempt < 5; attempt++) {
          if (await isProxyHealthy(port)) {
            return;
          }
          await Bun.sleep(200);
        }

        if (!silent) {
          console.error(
            `Relay proxy process ${pid} is running but not healthy on port ${port}.`,
          );
        }
        return;
      }

      unlinkSync(pidFilePath);
    } catch {
      // Ignore stale/unreadable PID files and try to start a fresh proxy.
    }
  }

  const serverScript = resolveProxyServerScriptPath();
  if (!serverScript) {
    if (!silent) {
      console.error("Unable to locate the relay proxy server entrypoint.");
    }
    return;
  }
  const child = Bun.spawn([process.execPath, serverScript], {
    env: {
      ...process.env,
      RELAY_PROXY_PORT: String(port),
    },
    stdout: null,
    stderr: null,
    stdin: null,
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    if (await isProxyHealthy(port)) {
      child.unref();
      if (!silent) {
        console.log(`Relay proxy ensured on port ${port}.`);
      }
      return;
    }
    await Bun.sleep(200);
  }

  child.unref();
  if (!silent) {
    console.error(`Failed to auto-start relay proxy on port ${port}.`);
  }
}

/**
 * Hook command for Claude Code SessionStart event.
 *
 * This command is designed to be called from Claude Code hooks.
 * It performs four actions:
 * 1. Rotates to the least-used provider (if rotation is enabled)
 * 2. Ensures the local relay proxy is running
 * 3. Installs Z.AI coding plugins (if the active provider is Z.AI)
 * 4. Updates ~/.claude/settings.json to point Claude Code at the local proxy
 *
 * The rotation happens BEFORE the proxy starts handling requests, so the CURRENT
 * session always uses the optimal provider based on the rotation strategy.
 *
 * Usage: relay hooks session-start [--silent]
 */
export default class HooksSessionStart extends BaseCommand<
  typeof HooksSessionStart
> {
  static description =
    "SessionStart hook - rotate provider, ensure proxy, and apply Claude settings";
  static examples = [
    "<%= config.bin %> hooks session-start",
    "<%= config.bin %> hooks session-start --silent",
  ];

  static flags = {
    silent: Flags.boolean({
      description: "Silent mode (no output, useful for hooks)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    // Skip when running inside a hook-spawned claude -p (recursion guard)
    if (process.env.RELAY_IN_HOOK === "1") {
      return;
    }

    const { flags } = await this.parse(HooksSessionStart);

    // Get the config to check if rotation is enabled
    let config = accountsConfig.loadConfig();

    // First, rotate to the least-used provider if rotation is enabled
    // This ensures the CURRENT session uses the optimal provider
    if (config.rotation.enabled) {
      try {
        const result = await accountsConfig.rotateAcrossProviders();
        // Only reload config if rotation actually happened
        if (result.rotated) {
          config = accountsConfig.loadConfig();
        }
      } catch {
        // Silent fail - rotation errors shouldn't break the session
      }
    }

    const currentAccount = config.activeModelProviderId
      ? config.accounts[config.activeModelProviderId]
      : null;

    const homeDir = getHomeDir();
    const claudeDir = join(homeDir, ".claude");
    const settingsFilePath = join(claudeDir, "settings.json");

    let settings: Record<string, unknown> = {};
    if (existsSync(settingsFilePath)) {
      try {
        const settingsContent = readFileSync(settingsFilePath, "utf-8");
        const parsed = JSON.parse(settingsContent);
        if (typeof parsed === "object" && parsed !== null) {
          settings = parsed as Record<string, unknown>;
        }
      } catch (error) {
        if (!flags.silent) {
          console.error("Failed to read settings.json, recreating it:", error);
        }
      }
    }

    const existingEnv =
      typeof settings.env === "object" && settings.env !== null
        ? (settings.env as Record<string, unknown>)
        : {};
    const { ANTHROPIC_MODEL: _anthropicModel, ...restEnv } = existingEnv;
    const proxyPort = getProxyPort(existingEnv.ANTHROPIC_BASE_URL);

    if (!process.env.RELAY_TEST_MODE) {
      await ensureRelayProxyRunning(proxyPort, flags.silent);
    }

    // --- Persist to settings.json for future sessions ---
    // NOTE: Claude Code reads settings.json env vars BEFORE SessionStart hooks
    // run, so writing to settings.json only takes effect on the NEXT session.
    // The settings must already contain relay proxy values before claude starts.
    settings.env = {
      ...restEnv,
      ANTHROPIC_AUTH_TOKEN: DEFAULT_PROXY_TOKEN,
      ANTHROPIC_BASE_URL: getProxyBaseUrl(proxyPort),
      API_TIMEOUT_MS:
        typeof restEnv.API_TIMEOUT_MS === "string"
          ? restEnv.API_TIMEOUT_MS
          : "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
        restEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? 1,
      ANTHROPIC_DEFAULT_OPUS_MODEL:
        typeof restEnv.ANTHROPIC_DEFAULT_OPUS_MODEL === "string"
          ? restEnv.ANTHROPIC_DEFAULT_OPUS_MODEL
          : DEFAULT_OPUS_MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL:
        typeof restEnv.ANTHROPIC_DEFAULT_SONNET_MODEL === "string"
          ? restEnv.ANTHROPIC_DEFAULT_SONNET_MODEL
          : DEFAULT_SONNET_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL:
        typeof restEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL === "string"
          ? restEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL
          : DEFAULT_HAIKU_MODEL,
    };

    try {
      mkdirSync(claudeDir, { recursive: true });
      const tempFilePath = `${settingsFilePath}.tmp`;
      writeFileSync(tempFilePath, JSON.stringify(settings, null, 2));
      renameSync(tempFilePath, settingsFilePath);
    } catch (error) {
      if (!flags.silent) {
        console.error("Failed to update settings.json:", error);
      }
    }

    if (!currentAccount) {
      if (!flags.silent) {
        console.error(
          "No active model provider found. Relay proxy was ensured, but requests will fail until an account is activated.",
        );
      }
      return;
    }

    // Install Z.AI coding plugins if active provider is Z.AI
    // Skip if RELAY_TEST_MODE is set (for automated tests)
    if (currentAccount.provider === "zai" && !process.env.RELAY_TEST_MODE) {
      try {
        this.installZaiPlugins(flags.silent);
      } catch {
        // Silent fail - plugin installation errors shouldn't break the session
      }
    }
  }

  /**
   * Install Z.AI coding plugins from the marketplace.
   * Only runs for Z.AI provider, not MiniMax.
   * Uses a cache marker file to skip re-checking if plugins were installed recently (1 hour TTL).
   */
  private installZaiPlugins(silent: boolean): void {
    // Check cache marker to avoid spawning claude CLI processes every session
    const homeDir = getHomeDir();
    const cacheMarker = join(homeDir, ".claude", ".zai-plugins-installed");
    const PLUGIN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const PLUGIN_COMMAND_TIMEOUT_MS = 5000; // 5 second timeout for plugin commands

    if (existsSync(cacheMarker)) {
      try {
        const markerTime = Number.parseInt(
          readFileSync(cacheMarker, "utf-8").trim(),
          10,
        );
        if (Date.now() - markerTime < PLUGIN_CACHE_TTL_MS) {
          return; // Plugins were installed recently, skip
        }
      } catch {
        // Invalid marker, proceed with installation
      }
    }

    // Check if claude CLI is available before attempting any commands
    try {
      execSync("which claude", {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: 2000,
      });
    } catch {
      // claude CLI not found, skip plugin installation
      return;
    }

    try {
      // Check if marketplace is already added
      const installedMarkets = execSync("claude plugin marketplace list", {
        encoding: "utf-8",
        stdio: "pipe",
        timeout: PLUGIN_COMMAND_TIMEOUT_MS,
      });

      if (!installedMarkets.includes("zai-org/zai-coding-plugins")) {
        if (!silent) {
          console.log("Adding Z.AI coding plugins marketplace...");
        }
        execSync("claude plugin marketplace add zai-org/zai-coding-plugins", {
          stdio: silent ? "pipe" : "inherit",
          timeout: PLUGIN_COMMAND_TIMEOUT_MS,
        });
      }

      // List available plugins from the marketplace
      const plugins = execSync(
        "claude plugin marketplace list-plugins zai-org/zai-coding-plugins",
        {
          encoding: "utf-8",
          stdio: "pipe",
          timeout: PLUGIN_COMMAND_TIMEOUT_MS,
        },
      );

      // Install each available plugin if not already installed
      const pluginLines = plugins.split("\n").filter((line) => line.trim());
      for (const line of pluginLines) {
        const pluginMatch = line.match(/^[\s-]*([a-z-]+)/i);
        if (pluginMatch) {
          const pluginName = pluginMatch[1];
          try {
            // Check if already installed
            execSync(`claude plugin list ${pluginName}`, {
              encoding: "utf-8",
              stdio: "pipe",
              timeout: PLUGIN_COMMAND_TIMEOUT_MS,
            });
          } catch {
            // Plugin not found, install it
            if (!silent) {
              console.log(`Installing Z.AI plugin: ${pluginName}`);
            }
            execSync(
              `claude plugin marketplace install zai-org/zai-coding-plugins ${pluginName}`,
              {
                stdio: silent ? "pipe" : "inherit",
                timeout: PLUGIN_COMMAND_TIMEOUT_MS,
              },
            );
          }
        }
      }

      // Write cache marker on success
      writeFileSync(cacheMarker, String(Date.now()));
    } catch {
      // Silent fail - plugin installation errors shouldn't break the session
      // Errors are already logged via console.error in catch blocks above
    }
  }
}
