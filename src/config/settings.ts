import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

// ── Config path ─────────────────────────────────────────────────────────────
const SETTINGS_DIR = `${process.env.HOME || homedir()}/.config/relay`;
const SETTINGS_PATH = `${SETTINGS_DIR}/settings.json`;

// ── Legacy config interface (matches the old v1 config format) ────────────────
interface LegacyConfig {
  version?: string;
  provider?: "zai" | "minimax" | "copilot";
  activeModelProviderId?: string;
  activeMcpProviderId?: string;
  zai?: {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
  };
  minimax?: {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
    groupId?: string;
  };
  copilot?: {
    apiKey?: string;
    baseUrl?: string;
    models?: string[];
  };
  history?: Array<{
    timestamp: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  }>;
}

// ── Load / Save ───────────────────────────────────────────────────────────────
export function loadSettings(): LegacyConfig {
  try {
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveSettings(settings: LegacyConfig): LegacyConfig {
  const dir = dirname(SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  return settings;
}

// ── Provider config helpers (used by legacy SDK) ────────────────────────────
export function getProviderConfig(provider: "zai" | "minimax" | "copilot"): Record<string, string> {
  const config = loadSettings();
  const providerConfig = config[provider];
  if (!providerConfig) return {};
  return {
    apiKey: "apiKey" in providerConfig ? (providerConfig.apiKey as string) : "",
    baseUrl: "baseUrl" in providerConfig ? (providerConfig.baseUrl as string) : "",
  };
}

export function setProviderConfig(
  provider: "zai" | "minimax" | "copilot",
  data: { apiKey: string; baseUrl: string; models?: string[] },
): LegacyConfig {
  const settings = loadSettings();
  const updated = { ...settings, [provider]: { apiKey: data.apiKey, baseUrl: data.baseUrl, models: data.models ?? [] } };
  return saveSettings(updated);
}

export function getActiveProvider(): "zai" | "minimax" | "copilot" {
  return loadSettings().provider ?? "zai";
}

export function setActiveProvider(provider: "zai" | "minimax" | "copilot"): LegacyConfig {
  const settings = loadSettings();
  return saveSettings({ ...settings, provider });
}
