import { type ChildProcess, execSync, spawn } from "node:child_process";
import { Flags } from "@oclif/core";
import * as accountsConfig from "../config/accounts-config";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import {
  getOpenCodeEnv,
  handleOpenCodeSetup,
  handleOpenCodeStatus,
  handleOpenCodeUninstall,
} from "./handlers/opencode-handler";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class OpenCode extends BaseCommand<typeof OpenCode> {
  static description = "Manage OpenCode integration with auto-rotation";

  static examples = [
    "<%= config.bin %> opencode",
    "<%= config.bin %> opencode --setup",
    "<%= config.bin %> opencode --status",
    "<%= config.bin %> opencode --uninstall",
  ];

  static flags = {
    setup: Flags.boolean({
      description: "Setup OpenCode configuration",
      char: "s",
      default: false,
    }),
    status: Flags.boolean({
      description: "Show OpenCode configuration status",
      char: "S",
      default: false,
    }),
    uninstall: Flags.boolean({
      description: "Remove OpenCode configuration",
      default: false,
    }),
  };

  static strict = false; // Allow arguments to pass through to opencode

  async run(): Promise<void> {
    const { flags, argv } = await this.parse(OpenCode);

    // Handle setup
    if (flags.setup) {
      await handleOpenCodeSetup();
      return;
    }

    // Handle status
    if (flags.status) {
      await handleOpenCodeStatus();
      return;
    }

    // Handle uninstall
    if (flags.uninstall) {
      await handleOpenCodeUninstall();
      return;
    }

    // If no flags, check if OpenCode is configured
    if (!accountsConfig.loadConfig().activeAccountId) {
      this.error("No accounts configured. Run 'relay account add' or 'relay config' first.");
    }

    // Find opencode CLI
    let opencodePath: string | null = null;
    try {
      opencodePath = execSync("which opencode 2>/dev/null", {
        encoding: "utf-8",
      }).trim();
    } catch {
      // Try npm global install
      try {
        opencodePath = execSync("npm root -g 2>/dev/null", {
          encoding: "utf-8",
        }).trim();
        opencodePath = opencodePath + "/opencode-ai/bin/opencode";
      } catch {
        this.error(
          "OpenCode CLI not found. Please install OpenCode first:\n  curl -fsSL https://opencode.ai/install | bash\n  or: npm i -g opencode-ai",
        );
      }
    }

    const config = accountsConfig.loadConfig();

    // Check if auto-rotation is enabled
    if (config.rotation.enabled) {
      const accounts = accountsConfig.listAccounts();

      // v2 multi-account rotation
      if (accounts.length > 1) {
        const previousAccount = accountsConfig.getActiveAccount();
        const rotationResult = config.rotation.crossProvider
          ? await accountsConfig.rotateAcrossProviders()
          : previousAccount?.provider
            ? {
                account: accountsConfig.rotateApiKey(previousAccount.provider),
                rotated: true,
              }
            : { account: null, rotated: false };

        const newAccount = rotationResult.account;
        if (rotationResult.rotated && newAccount) {
          this.log(
            `[auto-switch] ${previousAccount?.name || "none"} → ${newAccount.name} (${newAccount.provider})`,
          );
        }
      }
      // Legacy provider rotation (switch between zai/minimax)
      else if (config.rotation.crossProvider) {
        const currentProvider = settings.getActiveProvider();
        const zaiConfig = settings.getProviderConfig("zai");
        const minimaxConfig = settings.getProviderConfig("minimax");

        // Only rotate if both providers are configured
        if (zaiConfig.apiKey && minimaxConfig.apiKey) {
          const newProvider: "zai" | "minimax" = currentProvider === "zai" ? "minimax" : "zai";
          settings.setActiveProvider(newProvider);
          this.log(`[auto-switch] ${currentProvider} → ${newProvider}`);
        }
      }
    }

    // Get active account credentials
    const activeAccount = accountsConfig.getActiveAccount();

    if (!activeAccount) {
      // Fall back to legacy settings
      const legacyProvider = settings.getActiveProvider();
      const legacyConfig = settings.getProviderConfig(legacyProvider);

      if (!legacyConfig.apiKey) {
        this.error("No accounts configured. Run 'relay config' or 'relay account add' first.");
      }

      // Use legacy config
      const provider = PROVIDERS[legacyProvider]();
      const providerConfig = provider.getConfig();

      // Build environment
      const childEnv: Record<string, string> = {
        ...process.env,
        RELAY_PROVIDER_NPM: "@ai-sdk/anthropic",
        RELAY_BASE_URL: providerConfig.baseUrl,
        RELAY_API_KEY: providerConfig.apiKey,
      };

      // Clear Claude Code env vars to avoid conflicts
      delete childEnv.ANTHROPIC_AUTH_TOKEN;
      delete childEnv.ANTHROPIC_BASE_URL;

      const child: ChildProcess = spawn(opencodePath, argv as string[], {
        stdio: "inherit",
        env: childEnv,
      });

      child.on("close", (code: number | null) => {
        process.exit(code ?? 0);
      });

      return;
    }

    // Build environment with active account credentials
    const opencodeEnv = getOpenCodeEnv(activeAccount);

    const childEnv: Record<string, string> = {
      ...process.env,
      RELAY_PROVIDER_NPM: opencodeEnv.RELAY_PROVIDER_NPM,
      RELAY_BASE_URL: opencodeEnv.RELAY_BASE_URL,
      RELAY_API_KEY: opencodeEnv.RELAY_API_KEY,
      RELAY_GROUP_ID: opencodeEnv.RELAY_GROUP_ID,
      RELAY_PROVIDER: opencodeEnv.RELAY_PROVIDER,
    };

    // Clear Claude Code env vars to avoid conflicts
    delete childEnv.ANTHROPIC_AUTH_TOKEN;
    delete childEnv.ANTHROPIC_BASE_URL;

    // Spawn OpenCode
    const child: ChildProcess = spawn(opencodePath, argv as string[], {
      stdio: "inherit",
      env: childEnv,
    });

    child.on("close", (code: number | null) => {
      process.exit(code ?? 0);
    });
  }
}
