/**
 * Integration test: Account naming enforcement.
 *
 * Verifies that account names must be email addresses.
 * Safe to run on host — no real API calls.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TEST_DIR = path.join(os.tmpdir(), `relay-account-naming-test-${Date.now()}`);
const RELAY_BIN = path.join(process.cwd(), "src", "run.ts");

describe("account naming enforcement", () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(TEST_DIR, ".config", "relay"), { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test("rejects non-email account name", () => {
    const result = spawnSync(
      "bun",
      [
        RELAY_BIN,
        "account",
        "add",
        "--name",
        "Bad Name",
        "--provider",
        "zai",
        "--key",
        "test-key",
        "--non-interactive",
      ],
      {
        env: { ...process.env, HOME: TEST_DIR },
        timeout: 10_000,
      },
    );

    // Should exit with non-zero status
    expect(result.status).not.toBe(0);

    const stderr = result.stderr.toString();
    expect(stderr.toLowerCase()).toContain("email");
  });

  test("accepts email account name", () => {
    const result = spawnSync(
      "bun",
      [
        RELAY_BIN,
        "account",
        "add",
        "--name",
        "user@example.com",
        "--provider",
        "zai",
        "--key",
        "test-key",
        "--non-interactive",
      ],
      {
        env: { ...process.env, HOME: TEST_DIR },
        timeout: 10_000,
      },
    );

    // Should exit successfully
    expect(result.status).toBe(0);

    // Verify account was created with the email name
    const configPath = path.join(TEST_DIR, ".config", "relay", "settings.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const accounts = Object.values(config.accounts) as Array<{ name: string }>;
    expect(accounts.some((a) => a.name === "user@example.com")).toBe(true);
  });
});
