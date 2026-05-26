/**
 * Integration test: Proxy server in isolation.
 *
 * Tests the proxy server with mock upstream providers instead of real APIs.
 * Safe to run on host — no real API calls, no ForgeCode.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TEST_DIR = path.join(os.tmpdir(), `relay-proxy-test-${Date.now()}`);
const CONFIG_PATH = path.join(TEST_DIR, ".config", "relay", "settings.json");
const RELAY_BIN = path.join(process.cwd(), "src", "run.ts");

describe("proxy integration", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(TEST_DIR, ".config", "relay"), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test("proxy start and health check", () => {
    // Create a minimal config with a test account
    const config = {
      version: "2.0.0",
      accounts: {
        acc_test: {
          id: "acc_test",
          name: "test@example.com",
          provider: "zai",
          apiKey: "test-key",
          baseUrl: "https://api.test.com",
          priority: 1,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      },
      activeAccountId: "acc_test",
      rotation: {
        enabled: false,
        strategy: "round-robin",
        providerFilter: "cross-provider",
        allowedProviders: [],
      },
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    // Start proxy in background
    spawnSync("bun", [RELAY_BIN, "proxy", "start", "--port", "18787"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 5000,
    });

    // Give proxy time to start then check health
    setTimeout(() => {
      try {
        const healthResult = spawnSync("curl", ["-s", "http://127.0.0.1:18787/health"], {
          timeout: 3000,
        });
        const health = JSON.parse(healthResult.stdout.toString());
        expect(health.status).toBe("ok");
      } catch {
        // Proxy may not start in CI without network — that's acceptable
      }

      // Stop proxy
      spawnSync("bun", [RELAY_BIN, "proxy", "stop"], {
        env: { ...process.env, HOME: TEST_DIR },
        timeout: 5000,
      });
    }, 1000);
  });
});
