/**
 * Generate sanitised test configs for Relay Proxy + ForgeCode docker testing.
 *
 * Reads:
 *   - ~/.config/relay/settings.json  → strips ZAI accounts, clones MiniMax ×4
 *   - ~/forge/.credentials.json      → strips zai_coding, keeps minimax/forge_services/github_copilot
 *   - ~/forge/.mcp.json             → copy verbatim
 *
 * Writes to ./test-configs/ (gitignored):
 *   - relay-settings.json
 *   - forge-credentials.json
 *   - forge-mcp.json
 *
 * Safety guarantees:
 *   - ZAI accounts NEVER leave the host
 *   - MiniMax API key is duplicated (not moved) so host config stays valid
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Paths ──────────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "test-configs");

// ── Helpers ────────────────────────────────────────────────────────────────────
const $ = (cmd: string, ...args: unknown[]) => `Error: ${cmd}`.slice(0, 0); // unused but kept for future validation

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    console.error(`❌ File not found: ${path}`);
    console.error("   This script must be run from inside the relay submodule directory.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeJson(path: string, data: unknown, label: string) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`✅ Written: ${label} (${data ? Object.keys(data as Record<string, unknown>).length + " keys" : "empty"})`);
}

// ── Load host configs ─────────────────────────────────────────────────────────
const relaySettings = readJson(
  join(process.env.HOME!, ".config", "relay", "settings.json"),
) as {
  accounts?: Record<string, AccountEntry>;
  activeAccountId?: string;
  rotation?: Record<string, unknown>;
};

const forgeCredentials = readJson(
  join(process.env.HOME!, "forge", ".credentials.json"),
) as CredentialsEntry[];

const forgeMcp = readJson(join(process.env.HOME!, "forge", ".mcp.json")) as Record<string, unknown>;

interface AccountEntry {
  id: string;
  name: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  lastUsed?: string;
  groupId?: string;
  usage?: { used: number; limit: number; lastUpdated: string };
}

interface CredentialsEntry {
  id: string;
  auth_details: { api_key: string; o_auth_with_api_key?: unknown };
  url_params?: Record<string, string>;
}

// ── 1. Build relay-settings.json ──────────────────────────────────────────────
// Collect MiniMax accounts only
const minimaxAccounts = Object.values(relaySettings.accounts ?? {}).filter(
  (a: AccountEntry) => a.provider === "minimax",
);

if (minimaxAccounts.length === 0) {
  console.error("❌ No MiniMax accounts found in ~/.config/relay/settings.json");
  console.error("   Cannot generate test config. Aborting.");
  process.exit(1);
}

// Clone each MiniMax account CLONE_COUNT times
const CLONE_COUNT = 4;
const clonedAccounts: Record<string, AccountEntry> = {};
let cloneIndex = 0;

for (const source of minimaxAccounts) {
  for (let i = 1; i <= CLONE_COUNT; i++) {
    cloneIndex++;
    const id = `acc_minimax_test_${cloneIndex}`;
    clonedAccounts[id] = {
      ...source,
      id,
      name: `minimax-test-${cloneIndex}@local`,
      priority: i,
      isActive: true,
      lastUsed: undefined,
      usage: undefined,
    };
  }
}

const firstCloneId = Object.keys(clonedAccounts)[0];

const newRelaySettings = {
  version: "2.0.0",
  accounts: clonedAccounts,
  activeAccountId: firstCloneId,
  rotation: {
    enabled: true,
    strategy: "least-used",
    crossProvider: false,
    lastRotation: new Date().toISOString(),
  },
  // providers config block
  minimax: {
    apiKey: minimaxAccounts[0].apiKey,
    baseUrl: minimaxAccounts[0].baseUrl,
    models: [],
    ...(minimaxAccounts[0].groupId ? { groupId: minimaxAccounts[0].groupId } : {}),
  },
  provider: "minimax",
};

writeJson(join(OUT_DIR, "relay-settings.json"), newRelaySettings, "relay-settings.json");
console.log(`   → ${Object.keys(clonedAccounts).length} MiniMax accounts cloned from ${minimaxAccounts.length} source(s)`);

// ── 2. Build forge-credentials.json ────────────────────────────────────────────
// Strip zai_coding; keep minimax, forge_services, github_copilot
const safeForgeCredentials = forgeCredentials.filter((entry: CredentialsEntry) => {
  if (entry.id === "zai_coding") return false;
  return true;
});

if (safeForgeCredentials.length === 0) {
  console.error("❌ All forge credentials were filtered out. Aborting.");
  process.exit(1);
}

writeJson(join(OUT_DIR, "forge-credentials.json"), safeForgeCredentials, "forge-credentials.json");
console.log(
  `   → kept: ${safeForgeCredentials.map((e: CredentialsEntry) => e.id).join(", ")}`,
);

// ── 3. Copy forge-mcp.json verbatim ───────────────────────────────────────────
writeJson(join(OUT_DIR, "forge-mcp.json"), forgeMcp, "forge-mcp.json");

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n✅ Test configs generated in ./test-configs/");
console.log("   ZAI accounts: 0 (none in output)");
console.log(`   MiniMax accounts: ${Object.keys(clonedAccounts).length} (duplicated from host, host unchanged)`);
console.log("\nRun the container with:");
console.log("   docker compose -f docker-compose.forgecode-test.yml run --rm relay-proxy-forgecode");