import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { AccountConfig } from "../../config/accounts-config";
import { error, info, section, success, warning } from "../../utils/logger";

export const OPENCODE_CONFIG_PATH = path.join(homedir(), ".config", "opencode", "opencode.json");

export interface OpenCodeProviderConfig {
  npm?: string;
  options?: {
    baseURL?: string;
    apiKey?: string;
    timeout?: number;
  };
  models?: Record<
    string,
    {
      name: string;
    }
  >;
}

export interface OpenCodeConfig {
  $schema?: string;
  provider?: Record<string, OpenCodeProviderConfig>;
  mcp?: Record<string, unknown>;
  model?: string;
  plugin?: string[];
  [key: string]: unknown;
}

/**
 * Load existing OpenCode config or create empty object
 */
export function loadOpenCodeConfig(): OpenCodeConfig {
  if (!fs.existsSync(OPENCODE_CONFIG_PATH)) {
    return {};
  }

  try {
    const content = fs.readFileSync(OPENCODE_CONFIG_PATH, "utf-8");
    return JSON.parse(content) as OpenCodeConfig;
  } catch {
    return {};
  }
}

/**
 * Save OpenCode config
 */
export function saveOpenCodeConfig(config: OpenCodeConfig): void {
  const configDir = path.dirname(OPENCODE_CONFIG_PATH);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(OPENCODE_CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Map relay provider name to OpenCode provider name
 */
function getOpenCodeProviderName(provider: "zai" | "minimax"): string {
  return provider;
}

/**
 * Get the base URL for a provider
 */
function getProviderBaseUrl(provider: "zai" | "minimax"): string {
  switch (provider) {
    case "zai":
      return "https://api.z.ai/api/anthropic";
    case "minimax":
      return "https://api.minimax.io/anthropic/v1";
  }
}

/**
 * Get the model name for OpenCode based on provider
 */
function getOpenCodeModelName(provider: "zai" | "minimax"): string {
  switch (provider) {
    case "zai":
      return "claude-sonnet-4-5";
    case "minimax":
      return "MiniMax-M2.5";
  }
}

/**
 * Configure OpenCode to use a specific account
 */
export function configureOpenCode(account: AccountConfig): OpenCodeConfig {
  const config = loadOpenCodeConfig();

  // Set schema if not present
  if (!config.$schema) {
    config.$schema = "https://opencode.ai/config.json";
  }

  // Get provider name for OpenCode
  const providerName = getOpenCodeProviderName(account.provider);

  // Configure provider
  config.provider = {
    [providerName]: {
      npm: "@ai-sdk/anthropic",
      options: {
        baseURL: account.baseUrl,
        apiKey: account.apiKey,
      },
      models: {
        [getOpenCodeModelName(account.provider)]: {
          name: getOpenCodeModelName(account.provider),
        },
      },
    },
  };

  // Set default model
  config.model = getOpenCodeModelName(account.provider);

  // Remove Claude Code env var conflicts if they exist
  // (OpenCode will use its own config instead)

  return config;
}

/**
 * Update OpenCode config with placeholders (for env var substitution)
 * This allows rotation without rewriting the config file
 */
export function configureOpenCodeWithEnvVars(account: AccountConfig): OpenCodeConfig {
  const config = loadOpenCodeConfig();
  const envKey = `RELAY_${account.provider.toUpperCase()}_API_KEY`;
  const envGroupId =
    account.provider === "minimax" ? `RELAY_${account.provider.toUpperCase()}_GROUP_ID` : null;

  if (!config.$schema) {
    config.$schema = "https://opencode.ai/config.json";
  }

  const providerName = getOpenCodeProviderName(account.provider);

  config.provider = {
    [providerName]: {
      npm: "@ai-sdk/anthropic",
      options: {
        baseURL: account.baseUrl,
        apiKey: `{env:${envKey}}`,
      },
      models: {
        [getOpenCodeModelName(account.provider)]: {
          name: getOpenCodeModelName(account.provider),
        },
      },
    },
  };

  config.model = getOpenCodeModelName(account.provider);

  return config;
}

/**
 * Apply OpenCode configuration using environment variables
 * This is the recommended approach as it doesn't require rewriting config
 */
export async function handleOpenCodeSetup(silent = false): Promise<void> {
  try {
    // Ensure config directory exists
    const configDir = path.dirname(OPENCODE_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Load existing config or create new
    const config = loadOpenCodeConfig();

    if (!config.$schema) {
      config.$schema = "https://opencode.ai/config.json";
    }

    // Check if already configured
    const isConfigured =
      config.provider?.minimax?.options?.apiKey || config.provider?.zai?.options?.apiKey;

    if (isConfigured && !silent) {
      section("OpenCode Setup");
      info("OpenCode is already configured.");
      info(`Config location: ${OPENCODE_CONFIG_PATH}`);
      return;
    }

    // Save minimal config that uses environment variables
    // This allows relay to control credentials via env vars without rewriting config
    config.provider = {
      minimax: {
        npm: "@ai-sdk/anthropic",
        options: {
          baseURL: "{env:RELAY_BASE_URL}",
          apiKey: "{env:RELAY_API_KEY}",
        },
        models: {
          "MiniMax-M2.5": {
            name: "MiniMax-M2.5",
          },
        },
      },
      zai: {
        npm: "@ai-sdk/anthropic",
        options: {
          baseURL: "{env:RELAY_BASE_URL}",
          apiKey: "{env:RELAY_API_KEY}",
        },
        models: {
          "claude-sonnet-4-5": {
            name: "claude-sonnet-4-5",
          },
        },
      },
    };

    config.model = "MiniMax-M2.5";

    saveOpenCodeConfig(config);

    if (!silent) {
      section("OpenCode Setup");
      success("OpenCode configured to use environment variables.");
      info(`Config location: ${OPENCODE_CONFIG_PATH}`);
      info("");
      info("Environment variables used:");
      info("  • RELAY_PROVIDER_NPM - NPM package for provider");
      info("  • RELAY_BASE_URL - API base URL");
      info("  • RELAY_API_KEY - API key");
      info("  • RELAY_GROUP_ID - Group ID (MiniMax only)");
      info("");
      info("Run 'relay opencode' to start OpenCode with auto-rotation.");
    }
  } catch (err: unknown) {
    section("OpenCode Setup");
    error("Failed to setup OpenCode");
    if (err instanceof Error) {
      error(err.message);
    }
  }
}

/**
 * Uninstall/remove OpenCode configuration
 */
export async function handleOpenCodeUninstall(silent = false): Promise<void> {
  try {
    if (!fs.existsSync(OPENCODE_CONFIG_PATH)) {
      if (!silent) {
        section("OpenCode Uninstall");
        info("No OpenCode configuration found.");
      }
      return;
    }

    // Backup existing config
    const backupPath = `${OPENCODE_CONFIG_PATH}.backup`;
    fs.copyFileSync(OPENCODE_CONFIG_PATH, backupPath);

    // Remove the file
    fs.unlinkSync(OPENCODE_CONFIG_PATH);

    if (!silent) {
      section("OpenCode Uninstall");
      success("OpenCode configuration removed.");
      info(`Backup saved to: ${backupPath}`);
    }
  } catch (err: unknown) {
    section("OpenCode Uninstall");
    error("Failed to uninstall OpenCode configuration");
    if (err instanceof Error) {
      error(err.message);
    }
  }
}

/**
 * Show OpenCode configuration status
 */
export async function handleOpenCodeStatus(silent = false): Promise<void> {
  const configExists = fs.existsSync(OPENCODE_CONFIG_PATH);

  if (!silent) {
    section("OpenCode Status");

    if (!configExists) {
      info("OpenCode is not configured.");
      info("");
      warning("Run 'relay opencode setup' to configure OpenCode.");
      return;
    }

    const config = loadOpenCodeConfig();

    console.log(`Config location: ${OPENCODE_CONFIG_PATH}`);
    console.log("");

    // Show provider configuration
    if (config.provider) {
      console.log("Configured providers:");
      for (const [name, providerConfig] of Object.entries(config.provider)) {
        console.log(`  • ${name}:`);
        if (providerConfig.options?.baseURL) {
          console.log(`    Base URL: ${providerConfig.options.baseURL}`);
        }
        if (providerConfig.options?.apiKey) {
          const apiKey = providerConfig.options.apiKey;
          if (apiKey.startsWith("{env:")) {
            console.log(`    API Key: ${apiKey} (env var)`);
          } else {
            console.log(`    API Key: ${apiKey.slice(0, 8)}...`);
          }
        }
        if (providerConfig.models) {
          console.log(`    Models: ${Object.keys(providerConfig.models).join(", ")}`);
        }
      }
    }

    console.log("");
    console.log(`Default model: ${config.model || "not set"}`);

    // Check if using env var configuration
    const usesEnvVars = JSON.stringify(config).includes("{env:");
    console.log(`Environment variables: ${usesEnvVars ? "✓ Using" : "✗ Not using"}`);
  }
}

/**
 * Generate environment variables for OpenCode based on active account
 */
export function getOpenCodeEnv(account: AccountConfig): Record<string, string> {
  return {
    RELAY_PROVIDER_NPM: "@ai-sdk/anthropic",
    RELAY_BASE_URL: account.baseUrl,
    RELAY_API_KEY: account.apiKey,
    RELAY_GROUP_ID: account.groupId || "",
    RELAY_PROVIDER: account.provider,
  };
}
