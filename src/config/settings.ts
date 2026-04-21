import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface RELAYConfig {
  provider: "zai" | "minimax";
  zai?: {
    apiKey: string;
    baseUrl: string;
    models: string[];
  };
  minimax?: {
    apiKey: string;
    baseUrl: string;
    models: string[];
  };
  history?: {
    zai?: UsageRecord[];
    minimax?: UsageRecord[];
  };
}

export interface UsageRecord {
  date: string;
  used: number;
  limit: number;
}

const CONFIG_PATH = path.join(os.homedir(), ".claude", "relay.json");

export function getConfigDir(): string {
  return path.join(os.homedir(), ".claude");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function loadConfig(): RELAYConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, "utf-8");
      return JSON.parse(content) as RELAYConfig;
    }
  } catch {
    // Ignore errors
  }
  return { provider: "zai" };
}

export function saveConfig(config: RELAYConfig): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getProviderConfig(
  provider: "zai" | "minimax"
): Record<string, string> {
  const config = loadConfig();
  const providerConfig = config[provider];

  if (!providerConfig) {
    return {};
  }

  return {
    apiKey: "apiKey" in providerConfig ? (providerConfig.apiKey as string) : "",
    baseUrl:
      "baseUrl" in providerConfig ? (providerConfig.baseUrl as string) : "",
  };
}

export function setProviderConfig(
  provider: "zai" | "minimax",
  apiKey: string,
  baseUrl: string
): void {
  const config = loadConfig();
  config[provider] = { apiKey, baseUrl, models: [] };
  saveConfig(config);
}

export function getActiveProvider(): "zai" | "minimax" {
  const config = loadConfig();
  return config.provider || "zai";
}

export function setActiveProvider(provider: "zai" | "minimax"): void {
  const config = loadConfig();
  config.provider = provider;
  saveConfig(config);
}

export function recordUsage(
  provider: "zai" | "minimax",
  used: number,
  limit: number
): void {
  const config = loadConfig();
  const today = new Date().toISOString().split("T")[0];

  if (!config.history) {
    config.history = {};
  }
  if (!config.history[provider]) {
    config.history[provider] = [];
  }

  const existing = config.history[provider]?.find((r) => r.date === today);
  if (existing) {
    existing.used = used;
    existing.limit = limit;
  } else {
    config.history[provider]?.push({ date: today, used, limit });
    // Keep only last 30 days
    config.history[provider] = config.history[provider]?.slice(-30);
  }

  saveConfig(config);
}

export function getUsageHistory(provider: "zai" | "minimax"): UsageRecord[] {
  const config = loadConfig();
  return config.history?.[provider] || [];
}
