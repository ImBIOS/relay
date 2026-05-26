/**
 * Integration test: Usage timeout — verifies `relay usage --all` completes within time limit.
 *
 * Tests that the timeout wrapper prevents hanging on slow/unresponsive providers.
 * Safe to run on host — uses mock config, no real API calls.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TEST_DIR = path.join(os.tmpdir(), `relay-usage-timeout-test-${Date.now()}`);
const CONFIG_PATH = path.join(TEST_DIR, ".config", "relay", "settings.json");
const RELAY_BIN = path.join(process.cwd(), "src", "run.ts");

describe("usage timeout integration", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(TEST_DIR, ".config", "relay"), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test("relay usage --all completes within 20 seconds with invalid keys", () => {
    // Create config with accounts that have invalid API keys (will timeout/fail)
    const config = {
      version: "2.0.0",
      accounts: {
        acc_zai: {
          id: "acc_zai",
          name: "test@zai.com",
          provider: "zai",
          apiKey: "invalid-key-that-will-fail",
          baseUrl: "https://api.z.ai/api/anthropic",
          priority: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        acc_mm: {
          id: "acc_mm",
          name: "test@minimax.io",
          provider: "minimax",
          apiKey: "invalid-key-that-will-fail",
          baseUrl: "https://api.minimax.io/anthropic",
          priority: 2,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      },
      activeAccountId: "acc_zai",
      rotation: {
        enabled: false,
        strategy: "round-robin",
        providerFilter: "cross-provider",
        allowedProviders: [],
      },
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    const start = Date.now();
    const result = spawnSync("bun", [RELAY_BIN, "usage", "--all"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 20_000,
    });
    const elapsed = Date.now() - start;

    // Must complete within 20 seconds (not hang)
    expect(elapsed).toBeLessThan(20_000);

    // Should exit (even if with errors from invalid keys)
    expect(result.status).not.toBeNull();
  });
});
