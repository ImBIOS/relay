/**
 * Integration test: Shell wrapper install/uninstall for Codex CLI.
 *
 * Safe to run on host — uses isolated test home directory.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TEST_DIR = path.join(os.tmpdir(), `relay-codex-setup-test-${Date.now()}`);
const RELAY_BIN = path.join(process.cwd(), "src", "run.ts");
const ZSHRC_PATH = path.join(TEST_DIR, ".zshrc");
const CODEX_CONFIG_PATH = path.join(TEST_DIR, ".codex", "config.toml");

describe("hooks codex-setup integration", () => {
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
    spawnSync("bun", [RELAY_BIN, "hooks", "codex-setup"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    const zshrc = fs.readFileSync(ZSHRC_PATH, "utf-8");
    expect(zshrc).toContain("Relay Codex wrapper");
    expect(zshrc).toContain("OPENAI_BASE_URL");
    expect(zshrc).toContain("codex-stop");
  });

  test("writes ~/.codex/config.toml", () => {
    spawnSync("bun", [RELAY_BIN, "hooks", "codex-setup"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    expect(fs.existsSync(CODEX_CONFIG_PATH)).toBe(true);
    const config = fs.readFileSync(CODEX_CONFIG_PATH, "utf-8");
    expect(config).toContain('model = "gpt-4.1"');
    expect(config).toContain('provider = "openai"');
  });

  test("uninstalls shell wrapper from .zshrc", () => {
    // First install
    spawnSync("bun", [RELAY_BIN, "hooks", "codex-setup"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    const afterInstall = fs.readFileSync(ZSHRC_PATH, "utf-8");
    expect(afterInstall).toContain("Relay Codex wrapper");

    // Then uninstall
    spawnSync("bun", [RELAY_BIN, "hooks", "codex-setup", "--uninstall"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    const afterUninstall = fs.readFileSync(ZSHRC_PATH, "utf-8");
    expect(afterUninstall).toContain("# Test zshrc");
    expect(afterUninstall).not.toContain("Relay Codex wrapper");
  });

  test("idempotent install does not duplicate wrapper", () => {
    // Install twice
    spawnSync("bun", [RELAY_BIN, "hooks", "codex-setup"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });
    spawnSync("bun", [RELAY_BIN, "hooks", "codex-setup"], {
      env: { ...process.env, HOME: TEST_DIR },
      timeout: 10_000,
    });

    const zshrc = fs.readFileSync(ZSHRC_PATH, "utf-8");
    const count = zshrc.split("Relay Codex wrapper").length - 1;
    expect(count).toBe(1);
  });
});
