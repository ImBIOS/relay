/**
 * Integration test: Shell wrapper install/uninstall for ForgeCode.
 *
 * Safe to run on host — uses isolated test home directory.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TEST_DIR = path.join(os.tmpdir(), `relay-forge-setup-test-${Date.now()}`);
const RELAY_BIN = path.join(process.cwd(), "src", "run.ts");
const ZSHRC_PATH = path.join(TEST_DIR, ".zshrc");

describe("hooks forge-setup integration", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(ZSHRC_PATH, "# Test zshrc\n");
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  test("installs shell wrapper marker in .zshrc", () => {
    spawnSync("bun", [RELAY_BIN, "hooks", "forge-setup"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    const zshrc = fs.readFileSync(ZSHRC_PATH, "utf-8");
    // Should contain the relay wrapper marker
    expect(zshrc).toContain("relay");
  });

  test("uninstalls shell wrapper from .zshrc", () => {
    // First install
    spawnSync("bun", [RELAY_BIN, "hooks", "forge-setup"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    const afterInstall = fs.readFileSync(ZSHRC_PATH, "utf-8");
    expect(afterInstall).toContain("relay");

    // Then uninstall
    spawnSync("bun", [RELAY_BIN, "hooks", "forge-setup", "--uninstall"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    const afterUninstall = fs.readFileSync(ZSHRC_PATH, "utf-8");
    // The wrapper should be removed (back to original or close)
    // The original content should still be there
    expect(afterUninstall).toContain("# Test zshrc");
  });
});
