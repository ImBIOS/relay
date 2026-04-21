import * as fs from "node:fs";
import * as path from "node:path";

export interface ProfileConfig {
  name: string;
  provider: "zai" | "minimax";
  apiKey: string;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImBIOSConfig {
  activeProfile: string;
  profiles: Record<string, ProfileConfig>;
  settings: {
    defaultProvider: "zai" | "minimax";
    autoSwitch: boolean;
    logLevel: "info" | "debug" | "silent";
  };
}

const DEFAULT_CONFIG: ImBIOSConfig = {
  activeProfile: "default",
  profiles: {},
  settings: {
    defaultProvider: "zai",
    autoSwitch: false,
    logLevel: "info",
  },
};

export function getProfilesPath(): string {
  return `${process.env.HOME || process.env.USERPROFILE}/.claude/imbios-profiles.json`;
}

export function loadProfiles(): ImBIOSConfig {
  try {
    const configPath = getProfilesPath();

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as ImBIOSConfig;
    }
  } catch {
    // Ignore errors
  }
  return DEFAULT_CONFIG;
}

export function saveProfiles(config: ImBIOSConfig): void {
  const configPath = getProfilesPath();
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function createProfile(
  name: string,
  provider: "zai" | "minimax",
  apiKey: string,
  baseUrl: string
): ProfileConfig {
  const now = new Date().toISOString();

  const profile: ProfileConfig = {
    name,
    provider,
    apiKey,
    baseUrl,
    createdAt: now,
    updatedAt: now,
  };

  const config = loadProfiles();
  config.profiles[name] = profile;

  if (Object.keys(config.profiles).length === 1) {
    config.activeProfile = name;
  }

  saveProfiles(config);
  return profile;
}

export function switchProfile(name: string): boolean {
  const config = loadProfiles();

  if (!config.profiles[name]) {
    return false;
  }

  config.activeProfile = name;
  saveProfiles(config);
  return true;
}

export function deleteProfile(name: string): boolean {
  const config = loadProfiles();

  if (!config.profiles[name]) {
    return false;
  }

  if (name === config.activeProfile) {
    return false;
  }

  delete config.profiles[name];
  saveProfiles(config);
  return true;
}

export function getActiveProfile(): ProfileConfig | null {
  const config = loadProfiles();
  return config.profiles[config.activeProfile] || null;
}

export function listProfiles(): ProfileConfig[] {
  const config = loadProfiles();
  return Object.values(config.profiles);
}

export function updateProfileSettings(
  settings: Partial<ImBIOSConfig["settings"]>
): void {
  const config = loadProfiles();
  config.settings = { ...config.settings, ...settings };
  saveProfiles(config);
}

export function exportProfile(name: string): string | null {
  const config = loadProfiles();
  const profile = config.profiles[name];

  if (!profile) {
    return null;
  }

  return `# ImBIOS Profile: ${name}
export ANTHROPIC_AUTH_TOKEN="${profile.apiKey}"
export ANTHROPIC_BASE_URL="${profile.baseUrl}"
export API_TIMEOUT_MS=3000000
export IMBIOS_PROFILE="${name}"
`;
}
