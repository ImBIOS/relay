import { execSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Flags } from "@oclif/core";
import * as accountsConfig from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";

/**
 * Hook command for Claude Code SessionStart event.
 *
 * This command is designed to be called from Claude Code hooks.
 * It performs three actions:
 * 1. Rotates to the least-used provider (if rotation is enabled)
 * 2. Installs Z.AI coding plugins (if active provider is Z.AI)
 * 3. Updates ~/.claude/settings.json with the active account credentials
 *
 * The rotation happens BEFORE applying credentials, so the CURRENT session
 * always uses the optimal provider based on the rotation strategy.
 *
 * Usage: relay hooks session-start [--silent]
 */
export default class HooksSessionStart extends BaseCommand<
  typeof HooksSessionStart
> {
  static description =
    "SessionStart hook - apply current credentials and rotate";
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

    // Get the active model provider account for Claude Code sessions
    // activeModelProviderId is specifically for choosing which API key to use for models
    const currentAccount = config.activeModelProviderId
      ? config.accounts[config.activeModelProviderId]
      : null;

    if (!currentAccount) {
      if (!flags.silent) {
        console.error("No active model provider found");
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

    // Update settings.json with current account credentials
    // This is what Claude Code will use for the current session
    // Use HOME env var if set (for testing), otherwise use os.homedir()
    const homeDir = process.env.HOME || homedir();
    const settingsFilePath = join(homeDir, ".claude", "settings.json");
    if (existsSync(settingsFilePath)) {
      try {
        const settingsContent = readFileSync(settingsFilePath, "utf-8");
        const settings = JSON.parse(settingsContent);

        // Update the env section
        // Note: ANTHROPIC_MODEL is NOT set here - it causes errors when
        // switching providers on-the-fly. The provider and model are
        // determined via activeModelProviderId in .claude/settings.json
        settings.env = {
          ANTHROPIC_AUTH_TOKEN: currentAccount.apiKey,
          ANTHROPIC_BASE_URL: currentAccount.baseUrl,
          API_TIMEOUT_MS: "3000000",
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
        };

        // Atomic write: write to temp file first, then rename
        // This prevents data loss if write fails midway
        const tempFilePath = `${settingsFilePath}.tmp`;
        writeFileSync(tempFilePath, JSON.stringify(settings, null, 2));
        renameSync(tempFilePath, settingsFilePath);
      } catch (error) {
        // Silent fail - don't break the session if settings update fails
        if (!flags.silent) {
          console.error("Failed to update settings.json:", error);
        }
      }
    }

    // Play session start sound (unless silent mode)
    if (!flags.silent) {
    }
  }

  /**
   * Install Z.AI coding plugins from the marketplace.
   * Only runs for Z.AI provider, not MiniMax.
   * Uses a cache marker file to skip re-checking if plugins were installed recently (1 hour TTL).
   */
  private installZaiPlugins(silent: boolean): void {
    // Check cache marker to avoid spawning claude CLI processes every session
    const homeDir = process.env.HOME || homedir();
    const cacheMarker = join(homeDir, ".claude", ".zai-plugins-installed");
    const PLUGIN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const PLUGIN_COMMAND_TIMEOUT_MS = 5000; // 5 second timeout for plugin commands

    if (existsSync(cacheMarker)) {
      try {
        const markerTime = Number.parseInt(
          readFileSync(cacheMarker, "utf-8").trim(),
          10
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
        }
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
              }
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
