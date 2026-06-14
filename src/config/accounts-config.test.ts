import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { deduplicateAccounts, loadConfig } from "./accounts-config";

const TEST_DIR = path.join(os.tmpdir(), `relay-accounts-config-test-${Date.now()}`);
const CONFIG_PATH = path.join(TEST_DIR, ".config", "relay", "settings.json");

function writeConfig(config: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

describe("deduplicateAccounts", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = TEST_DIR;
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("keeps the newest account for each name+provider pair", () => {
    writeConfig({
      version: "2.0.0",
      accounts: {
        acc_old: {
          id: "acc_old",
          name: "user@example.com",
          provider: "cursor",
          apiKey: "old-token",
          baseUrl: "",
          priority: 0,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        acc_new: {
          id: "acc_new",
          name: "user@example.com",
          provider: "cursor",
          apiKey: "new-token",
          baseUrl: "",
          priority: 0,
          isActive: true,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
        acc_zai: {
          id: "acc_zai",
          name: "user@example.com",
          provider: "zai",
          apiKey: "zai-key",
          baseUrl: "",
          priority: 0,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
      activeAccountId: "acc_new",
      rotation: {
        enabled: true,
        strategy: "least-used",
        providerFilter: "cross-provider",
        allowedProviders: [],
      },
    });

    const removed = deduplicateAccounts();
    const config = loadConfig();

    expect(removed).toBe(1);
    expect(Object.keys(config.accounts)).toEqual(["acc_new", "acc_zai"]);
    expect(config.accounts.acc_new?.apiKey).toBe("new-token");
    expect(config.activeAccountId).toBe("acc_new");
  });

  it("repoints active account when the active duplicate is removed", () => {
    writeConfig({
      version: "2.0.0",
      accounts: {
        acc_old_active: {
          id: "acc_old_active",
          name: "user@example.com",
          provider: "cursor",
          apiKey: "old-token",
          baseUrl: "",
          priority: 0,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        acc_new: {
          id: "acc_new",
          name: "user@example.com",
          provider: "cursor",
          apiKey: "new-token",
          baseUrl: "",
          priority: 0,
          isActive: true,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      },
      activeAccountId: "acc_old_active",
      rotation: {
        enabled: true,
        strategy: "least-used",
        providerFilter: "cross-provider",
        allowedProviders: [],
      },
    });

    deduplicateAccounts();
    const config = loadConfig();

    expect(Object.keys(config.accounts)).toEqual(["acc_new"]);
    expect(config.activeAccountId).toBe("acc_new");
  });

  it("returns 0 when there are no duplicates", () => {
    writeConfig({
      version: "2.0.0",
      accounts: {
        acc_one: {
          id: "acc_one",
          name: "user@example.com",
          provider: "cursor",
          apiKey: "token",
          baseUrl: "",
          priority: 0,
          isActive: true,
          createdAt: "2026-06-01T00:00:00.000Z",
        },
      },
      activeAccountId: "acc_one",
      rotation: {
        enabled: true,
        strategy: "least-used",
        providerFilter: "cross-provider",
        allowedProviders: [],
      },
    });

    expect(deduplicateAccounts()).toBe(0);
  });
});
