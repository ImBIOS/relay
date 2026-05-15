import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { getDefaultBaseUrl } from "./provider-metadata";
export interface AccountConfig {
  id: string;
  name: string;
  provider: "zai" | "minimax" | "copilot";
  apiKey: string;
  baseUrl: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  lastUsed?: string;
  groupId?: string; // Required for MiniMax usage tracking
  // For GitHub Copilot: OAuth token (gho_...) used for usage queries
  // The apiKey holds the Copilot session token (tid=...) for API calls
  oauthToken?: string;
  usage?: {
    used: number;
    limit: number;
    lastUpdated: string;
  };
}

export type RotationStrategy = "round-robin" | "least-used" | "priority" | "random";

export interface RotationConfig {
  enabled: boolean;
  strategy: RotationStrategy;
  crossProvider: boolean;
  maxUsesPerKey?: number;
  lastRotation?: string;
}

export interface RELAYConfig {
  version: "2.0.0";
  accounts: Record<string, AccountConfig>;
  activeAccountId: string | null;
  rotation: RotationConfig;
}

export const DEFAULT_CONFIG: RELAYConfig = {
  version: "2.0.0",
  accounts: {},
  activeAccountId: null,
  rotation: {
    enabled: true,
    strategy: "least-used",
    crossProvider: true,
  },
};

// ── Config cache ──────────────────────────────────────────────────────
let _config: RELAYConfig | undefined;
let _configMtime = 0;

export function getConfigPath(): string {
  return `${process.env.HOME || process.env.USERPROFILE}/.config/relay/settings.json`;
}

export function loadConfig(): RELAYConfig {
  const configPath = getConfigPath();
  try {
    const stat = statSync(configPath);
    if (_config && stat.mtimeMs === _configMtime) {
      return _config;
    }
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content);
    _config = { ...DEFAULT_CONFIG, ...parsed } as RELAYConfig;
    _configMtime = stat.mtimeMs;
    return _config;
  } catch {
    _config = { ...DEFAULT_CONFIG };
    return _config;
  }
}

export function saveConfig(config: RELAYConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Atomic write: write to tmp then rename
  const tmpPath = `${configPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(config, null, 2));
  renameSync(tmpPath, configPath);

  // Update cache immediately
  _config = config;
  try {
    _configMtime = statSync(configPath).mtimeMs;
  } catch {
    // ignore
  }
}

export function generateAccountId(): string {
  return `acc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function addAccount(input: {
  name: string;
  provider: "zai" | "minimax" | "copilot";
  apiKey: string;
  baseUrl?: string;
  groupId?: string;
  oauthToken?: string;
}): AccountConfig {
  const { name, provider, apiKey, baseUrl, groupId, oauthToken } = input;
  const id = generateAccountId();
  const now = new Date().toISOString();

  const account: AccountConfig = {
    id,
    name,
    provider,
    apiKey,
    baseUrl: baseUrl ?? getDefaultBaseUrl(provider),
    priority: 0,
    isActive: true,
    createdAt: now,
    ...(groupId && { groupId }),
    ...(oauthToken && { oauthToken }),
  };

  const config = loadConfig();
  config.accounts[id] = account;

  if (!config.activeAccountId) {
    config.activeAccountId = id;
  }

  saveConfig(config);
  return account;
}

export function updateAccount(id: string, updates: Partial<AccountConfig>): AccountConfig | null {
  const config = loadConfig();
  const account = config.accounts[id];

  if (!account) {
    return null;
  }

  config.accounts[id] = {
    ...account,
    ...updates,
    lastUsed: new Date().toISOString(),
  };
  saveConfig(config);
  return config.accounts[id];
}
export function deleteAccount(id: string): AccountConfig | null {
  const config = loadConfig();
  const account = config.accounts[id];
  if (!account) return null;

  delete config.accounts[id];
  if (config.activeAccountId === id) {
    const remainingIds = Object.keys(config.accounts);
    config.activeAccountId = remainingIds.length > 0 ? remainingIds[0]! : null;
  }
  saveConfig(config);
  return account;
}
export function getAccount(id: string): AccountConfig | null {
  const config = loadConfig();
  return config.accounts[id] ?? null;
}

export function switchAccount(id: string): AccountConfig | null {
  const config = loadConfig();
  if (!config.accounts[id]) return null;
  config.activeAccountId = id;
  config.accounts[id]!.lastUsed = new Date().toISOString();
  saveConfig(config);
  return config.accounts[id]!;
}

export function getActiveAccount(): AccountConfig | null {
  const config = loadConfig();
  if (!config.activeAccountId) {
    return null;
  }
  return config.accounts[config.activeAccountId] || null;
}

export function listAccounts(): AccountConfig[] {
  const config = loadConfig();
  return Object.values(config.accounts).sort((a, b) => a.priority - b.priority);
}

export function rotateApiKey(provider: "zai" | "minimax" | "copilot"): AccountConfig | null {
  const config = loadConfig();
  const providerAccounts = Object.values(config.accounts)
    .filter((a) => a.provider === provider && a.isActive)
    .sort((a, b) => {
      if (config.rotation.strategy === "least-used") {
        return (a.usage?.used || 0) - (b.usage?.used || 0);
      }
      return a.priority - b.priority;
    });

  if (providerAccounts.length === 0) {
    return null;
  }

  const currentIndex = providerAccounts.findIndex((a) => a.id === config.activeAccountId);
  const nextIndex = (currentIndex + 1) % providerAccounts.length;
  const nextAccount = providerAccounts[nextIndex];

  // nextAccount is guaranteed to exist since providerAccounts.length > 0
  config.activeAccountId = nextAccount!.id;
  nextAccount!.lastUsed = new Date().toISOString();
  saveConfig(config);

  return nextAccount!;
}

export function configureRotation(
  enabled: boolean,
  strategy?: RotationStrategy,
  crossProvider?: boolean,
): void {
  const config = loadConfig();
  config.rotation.enabled = enabled;
  if (strategy) {
    config.rotation.strategy = strategy;
  }
  if (crossProvider !== undefined) {
    config.rotation.crossProvider = crossProvider;
  }
  saveConfig(config);
}

/**
 * Fetch real usage data from provider API and update account config
 * This ensures least-used rotation uses accurate, up-to-date data
 *
 * Uses a TTL cache to avoid hitting APIs on every session start/resume/clear/compact.
 * Default TTL: 5 minutes.
 *
 * For rotation comparison, uses the DISPLAYED percentage:
 * - ZAI: Uses MCP usage percentage (mcpUsage.percentUsed)
 * - MiniMax: Uses remaining percentage (percentRemaining) - what's displayed
 *
 * This ensures rotation matches what the user sees in `relay usage`
 */
const USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchAndUpdateUsage(account: AccountConfig): Promise<number> {
  // Check if cached usage is still fresh
  if (account.usage?.lastUpdated) {
    const age = Date.now() - new Date(account.usage.lastUpdated).getTime();
    if (age < USAGE_CACHE_TTL_MS && account.usage.limit > 0) {
      return (account.usage.used / account.usage.limit) * 100;
    }
  }

  try {
    // Dynamically import providers to avoid circular dependencies
    const { zaiProvider } = await import("../providers/zai.js");
    const { minimaxProvider } = await import("../providers/minimax.js");
    const { copilotProvider } = await import("../providers/copilot.js");

    const PROVIDERS = { zai: zaiProvider, minimax: minimaxProvider, copilot: copilotProvider };
    const provider = PROVIDERS[account.provider];

    // Pass account-specific options to getUsage
    const usage = await provider.getUsage({
      apiKey: account.apiKey,
      groupId: account.groupId,
      oauthToken: account.oauthToken,
    });

    // Update account config with real usage data
    if (usage.limit > 0) {
      updateAccount(account.id, {
        usage: {
          used: usage.used,
          limit: usage.limit,
          lastUpdated: new Date().toISOString(),
        },
      });

      // For rotation, use the ACTUAL USAGE PERCENTAGE (lower = less used)
      // ZAI: use mcpUsage.percentUsed (55% when used)
      // MiniMax: use percentUsed, NOT percentRemaining
      if (account.provider === "zai" && usage.mcpUsage) {
        return usage.mcpUsage.percentUsed;
      }
      // MiniMax: always use percentUsed for rotation comparison
      return usage.percentUsed;
    }
  } catch {
    // Silently fail and fall back to cached usage
  }

  // Fallback to cached usage percentage
  if (account.usage && account.usage.limit > 0) {
    return (account.usage.used / account.usage.limit) * 100;
  }
  return 0;
}

export interface RotationResult {
  account: AccountConfig | null;
  rotated: boolean;
}

export async function rotateAcrossProviders(): Promise<RotationResult> {
  const config = loadConfig();
  const allAccounts = Object.values(config.accounts).filter((a) => a.isActive);

  if (allAccounts.length === 0) {
    return { account: null, rotated: false };
  }

  const currentId = config.activeAccountId;
  let nextAccount: AccountConfig | null = null;

  switch (config.rotation.strategy) {
    case "random": {
      const otherAccounts = allAccounts.filter((a) => a.id !== currentId);
      if (otherAccounts.length === 0) {
        nextAccount = allAccounts[0] ?? null;
      } else {
        nextAccount = otherAccounts[Math.floor(Math.random() * otherAccounts.length)] ?? null;
      }
      break;
    }

    case "round-robin": {
      const sorted = allAccounts.sort((a, b) => a.priority - b.priority);
      const currentIndex = sorted.findIndex((a) => a.id === currentId);
      const nextIndex = (currentIndex + 1) % sorted.length;
      nextAccount = sorted[nextIndex] ?? null;
      break;
    }

    case "least-used": {
      // Fetch real usage data from all provider APIs
      const accountsWithUsage = await Promise.all(
        allAccounts.map(async (acc) => ({
          account: acc,
          usage: await fetchAndUpdateUsage(acc),
        })),
      );

      // Sort by actual usage (lowest first)
      accountsWithUsage.sort((a, b) => a.usage - b.usage);
      nextAccount = accountsWithUsage[0]?.account ?? null;
      break;
    }

    case "priority": {
      // Priority-based selection: use highest priority account that has quota available
      // Sort by priority (highest first), then find first with available quota
      const sorted = allAccounts.sort((a, b) => b.priority - a.priority);

      // Check if current account still has quota - if so, don't rotate
      if (currentId) {
        const current = sorted.find((a) => a.id === currentId);
        if (current && current.usage) {
          // Keep current until 100% exhausted
          if (current.usage.used < current.usage.limit) {
            nextAccount = current;
            break;
          }
        } else {
          // No usage data yet - use highest priority account
          nextAccount = sorted[0] ?? null;
          break;
        }
      }

      // Current account is exhausted or none active - find next available
      for (const account of sorted) {
        if (!account.usage || account.usage.used < account.usage.limit) {
          nextAccount = account;
          break;
        }
      }
      break;
    }
  }

  const didRotate = nextAccount !== null && nextAccount.id !== currentId;
  if (didRotate && nextAccount) {
    config.activeAccountId = nextAccount.id;
    nextAccount.lastUsed = new Date().toISOString();
    config.rotation.lastRotation = new Date().toISOString();
    saveConfig(config);
  }

  return { account: nextAccount, rotated: didRotate };
}
