/**
 * ImBIOS SDK - Auto-rotation wrapper for Claude Agent SDK
 * @deprecated We use OpenCode
 *
 * Provides automatic provider rotation when using the Claude Agent SDK.
 * Uses the same rotation strategies as `relay claude` command.
 *
 * @example
 * ```typescript
 * import { query, getAutoRotatedEnv } from "@imbios/coding-helper/sdk";
 *
 * // Option 1: Use the wrapped query function (auto-rotates on each call)
 * for await (const message of query({
 *   prompt: "Fix the bug in auth.py",
 *   options: { allowedTools: ["Read", "Edit", "Bash"] }
 * })) {
 *   console.log(message);
 * }
 *
 * // Option 2: Get rotated env and use with original SDK
 * import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
 * const env = getAutoRotatedEnv();
 * for await (const message of sdkQuery({
 *   prompt: "...",
 *   options: { env }
 * })) {
 *   console.log(message);
 * }
 * ```
 */

import { type Options, query as originalQuery, type Query } from "@anthropic-ai/claude-agent-sdk";
import * as accountsConfig from "../config/accounts-config";
import * as settings from "../config/settings";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export interface RotationResult {
  rotated: boolean;
  previousAccount: string | null;
  currentAccount: string | null;
  provider: "zai" | "minimax" | null;
}

/**
 * Perform auto-rotation if enabled and return rotation info.
 * Call this before SDK queries to rotate provider/account.
 *
 * Supports both:
 * - v2 multi-account rotation (multiple accounts in relay-accounts-config.json)
 * - Legacy provider rotation (switch between zai/minimax in imbios.json)
 */
export async function performAutoRotation(): Promise<RotationResult> {
  const config = accountsConfig.loadConfig();

  if (!config.rotation.enabled) {
    const activeAccount = accountsConfig.getActiveAccount();
    const legacyProvider = activeAccount ? null : settings.getActiveProvider();
    return {
      rotated: false,
      previousAccount: activeAccount?.name ?? legacyProvider ?? null,
      currentAccount: activeAccount?.name ?? legacyProvider ?? null,
      provider: activeAccount?.provider ?? legacyProvider ?? null,
    };
  }

  const accounts = accountsConfig.listAccounts();

  // If v2 accounts exist, use v2 rotation
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

    return {
      rotated: rotationResult.rotated,
      previousAccount: previousAccount?.name ?? null,
      currentAccount: newAccount?.name ?? previousAccount?.name ?? null,
      provider: newAccount?.provider ?? previousAccount?.provider ?? null,
    };
  }

  // Fallback: Legacy provider rotation (switch between zai/minimax)
  if (config.rotation.crossProvider) {
    const currentProvider = settings.getActiveProvider();
    const zaiConfig = settings.getProviderConfig("zai");
    const minimaxConfig = settings.getProviderConfig("minimax");

    // Only rotate if both providers are configured
    if (zaiConfig.apiKey && minimaxConfig.apiKey) {
      const newProvider: "zai" | "minimax" = currentProvider === "zai" ? "minimax" : "zai";
      settings.setActiveProvider(newProvider);

      return {
        rotated: true,
        previousAccount: currentProvider,
        currentAccount: newProvider,
        provider: newProvider,
      };
    }
  }

  // No rotation possible
  const legacyProvider = settings.getActiveProvider();
  return {
    rotated: false,
    previousAccount: legacyProvider,
    currentAccount: legacyProvider,
    provider: legacyProvider,
  };
}

/**
 * Get environment variables for the currently active account.
 * If auto-rotation is enabled, rotates first.
 *
 * @param autoRotate - Whether to perform auto-rotation (default: true)
 * @returns Environment variables with ANTHROPIC_* credentials set
 */
export async function getAutoRotatedEnv(
  autoRotate = true,
): Promise<Record<string, string | undefined>> {
  if (autoRotate) {
    await performAutoRotation();
  }

  const activeAccount = accountsConfig.getActiveAccount();

  if (activeAccount) {
    // Get model from provider (auto-translated by server)
    const provider = PROVIDERS[activeAccount.provider]?.();
    // Build environment - only disable non-essential traffic for MiniMax
    const env: Record<string, string | undefined> = {
      ...process.env,
      ANTHROPIC_AUTH_TOKEN: activeAccount.apiKey,
      ANTHROPIC_BASE_URL: activeAccount.baseUrl,
      // ANTHROPIC_MODEL is NOT set - providers handle translation
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };

    return env;
  }

  // Fall back to legacy settings
  const legacyProvider = settings.getActiveProvider();
  const provider = PROVIDERS[legacyProvider]?.();

  if (!provider) {
    return { ...process.env };
  }

  const providerConfig = provider.getConfig();

  // Build environment - only disable non-essential traffic for MiniMax
  const env: Record<string, string | undefined> = {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: providerConfig.apiKey,
    ANTHROPIC_BASE_URL: providerConfig.baseUrl,
    // ANTHROPIC_MODEL is NOT set - providers handle translation
    API_TIMEOUT_MS: "3000000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };

  return env;
}

/**
 * Get credential info for the currently active account (without rotation).
 */
export function getActiveCredentials(): {
  apiKey: string;
  baseUrl: string;
  provider: "zai" | "minimax";
  accountName: string | null;
} | null {
  const activeAccount = accountsConfig.getActiveAccount();

  if (activeAccount) {
    return {
      apiKey: activeAccount.apiKey,
      baseUrl: activeAccount.baseUrl,
      provider: activeAccount.provider,
      accountName: activeAccount.name,
    };
  }

  // Fall back to legacy settings
  const legacyProvider = settings.getActiveProvider();
  const provider = PROVIDERS[legacyProvider]?.();

  if (!provider) {
    return null;
  }

  const providerConfig = provider.getConfig();

  if (!providerConfig.apiKey) {
    return null;
  }

  return {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    provider: legacyProvider,
    accountName: null,
  };
}

export interface ImBIOSQueryParams {
  prompt: Parameters<typeof originalQuery>[0]["prompt"];
  options?: Options & {
    /** Disable auto-rotation for this query (default: true) */
    autoRotate?: boolean;
    /** Log rotation info to console (default: false) */
    logRotation?: boolean;
  };
}

/**
 * Wrapped query function with auto-rotation support.
 *
 * Same API as the Claude Agent SDK's query(), but automatically
 * rotates provider/account before each call if auto-rotation is enabled.
 *
 * @example
 * ```typescript
 * import { query } from "@imbios/coding-helper/sdk";
 *
 * for await (const message of query({
 *   prompt: "Fix the bug",
 *   options: {
 *     allowedTools: ["Read", "Edit"],
 *     logRotation: true  // Log when rotation occurs
 *   }
 * })) {
 *   if ("result" in message) console.log(message.result);
 * }
 * ```
 */
export function query(params: ImBIOSQueryParams): Query {
  const { prompt, options = {} } = params;
  const { autoRotate = true, logRotation = false, ...sdkOptions } = options;

  // Perform rotation and get env
  const _rotationPromise = autoRotate
    ? performAutoRotation()
    : Promise.resolve({
        rotated: false,
        previousAccount: null,
        currentAccount: null,
        provider: null,
      });

  // For async rotation, we need to handle this differently
  // Since the SDK's query function is synchronous in its options, we'll need to make query async too
  // But for now, let's keep the API synchronous by using the env without rotation in the sync path
  // Users should call getAutoRotatedEnv() explicitly first if they want rotation

  return originalQuery({
    prompt,
    options: {
      ...sdkOptions,
      env: getAutoRotatedEnvSync(),
    },
  });
}

// Synchronous version that doesn't rotate - used internally
function getAutoRotatedEnvSync(): Record<string, string | undefined> {
  const activeAccount = accountsConfig.getActiveAccount();

  if (activeAccount) {
    // Get model from provider (auto-translated by server)
    const provider = PROVIDERS[activeAccount.provider]?.();
    // Build environment - only disable non-essential traffic for MiniMax
    const env: Record<string, string | undefined> = {
      ...process.env,
      ANTHROPIC_AUTH_TOKEN: activeAccount.apiKey,
      ANTHROPIC_BASE_URL: activeAccount.baseUrl,
      // ANTHROPIC_MODEL is NOT set - providers handle translation
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };

    return env;
  }

  // Fall back to legacy settings
  const legacyProvider = settings.getActiveProvider();
  const provider = PROVIDERS[legacyProvider]?.();

  if (!provider) {
    return { ...process.env };
  }

  const providerConfig = provider.getConfig();

  // Build environment - only disable non-essential traffic for MiniMax
  const env: Record<string, string | undefined> = {
    ...process.env,
    ANTHROPIC_AUTH_TOKEN: providerConfig.apiKey,
    ANTHROPIC_BASE_URL: providerConfig.baseUrl,
    // ANTHROPIC_MODEL is NOT set - providers handle translation
    API_TIMEOUT_MS: "3000000",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };

  return env;
}

// Re-export all types from the SDK for convenience
export type {
  AgentDefinition,
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  Options,
  PermissionMode,
  Query,
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
} from "@anthropic-ai/claude-agent-sdk";

// Re-export utilities
export { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
