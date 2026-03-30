import { execSync, spawn } from "node:child_process";
import * as accountsConfig from "../config/accounts-config";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class Claude extends BaseCommand<typeof Claude> {
  static description = "Spawn Claude with auto-switch";
  static examples = [
    "<%= config.bin %> claude",
    "<%= config.bin %> claude --continue",
  ];

  static strict = false; // Allow any arguments to pass through

  async run(): Promise<void> {
    // Find claude CLI
    let claudePath: string | null = null;
    try {
      claudePath = execSync("which claude 2>/dev/null", {
        encoding: "utf-8",
      }).trim();
    } catch {
      this.error("Claude CLI not found. Please install Claude Code first.");
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
            `[auto-switch] ${previousAccount?.name || "none"} → ${newAccount.name} (${newAccount.provider})`
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
          const newProvider: "zai" | "minimax" =
            currentProvider === "zai" ? "minimax" : "zai";
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
        this.error(
          "No accounts configured. Run 'relay config' or 'relay account add' first."
        );
      }

      // Use legacy config
      const provider = PROVIDERS[legacyProvider]();
      const providerConfig = provider.getConfig();

      // Build environment - only disable non-essential traffic for MiniMax
      const childEnv: Record<string, string> = {
        ...process.env,
        ANTHROPIC_AUTH_TOKEN: providerConfig.apiKey,
        ANTHROPIC_BASE_URL: providerConfig.baseUrl,
        // ANTHROPIC_MODEL is NOT set - providers handle translation
        API_TIMEOUT_MS: "3000000",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      };

      // Get args passed to this command
      const args = this.argv;

      const child = spawn(claudePath, args, {
        stdio: "inherit",
        env: childEnv,
      });

      child.on("close", (code) => {
        process.exit(code ?? 0);
      });

      return;
    }

    // Build environment - only disable non-essential traffic for MiniMax
    const childEnv: Record<string, string> = {
      ...process.env,
      ANTHROPIC_AUTH_TOKEN: activeAccount.apiKey,
      ANTHROPIC_BASE_URL: activeAccount.baseUrl,
      // ANTHROPIC_MODEL is NOT set - providers handle translation
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };

    // Get args passed to this command
    const args = this.argv;

    const child = spawn(claudePath, args, {
      stdio: "inherit",
      env: childEnv,
    });

    child.on("close", (code) => {
      process.exit(code ?? 0);
    });
  }
}
