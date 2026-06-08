import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formatPromptOutput, parsePromptFormat } from "./prompt-fast";

const TEST_HOME = join(tmpdir(), `relay-prompt-fast-${Date.now()}`);
const CONFIG_DIR = join(TEST_HOME, ".config", "relay");
const CONFIG_PATH = join(CONFIG_DIR, "settings.json");

describe("prompt-fast", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = TEST_HOME;
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        version: "2.0.0",
        activeAccountId: "acc_1",
        accounts: {
          acc_1: {
            id: "acc_1",
            name: "user@example.com",
            provider: "zai",
            apiKey: "key",
            baseUrl: "https://api.z.ai",
            priority: 1,
            isActive: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
        rotation: {
          enabled: true,
          strategy: "least-used",
          providerFilter: "cross-provider",
          allowedProviders: [],
        },
      }),
    );
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    if (existsSync(TEST_HOME)) rmSync(TEST_HOME, { recursive: true, force: true });
  });

  describe("parsePromptFormat", () => {
    it("defaults to starship", () => {
      expect(parsePromptFormat([])).toBe("starship");
    });

    it("parses --format=starship", () => {
      expect(parsePromptFormat(["--format=starship"])).toBe("starship");
    });

    it("parses --format zsh", () => {
      expect(parsePromptFormat(["--format", "zsh"])).toBe("zsh");
    });
  });

  describe("formatPromptOutput", () => {
    it("outputs starship format with rotation strategy", () => {
      const output = formatPromptOutput("starship");
      expect(output).toContain("zai");
      expect(output).toContain("user@example.com");
      expect(output).toContain("least-used:cross-provider");
    });

    it("outputs plain format with relay prefix", () => {
      const output = formatPromptOutput("plain");
      expect(output?.startsWith("relay:")).toBe(true);
    });

    it("returns null when no active account", () => {
      writeFileSync(
        CONFIG_PATH,
        JSON.stringify({
          version: "2.0.0",
          activeAccountId: null,
          accounts: {},
          rotation: { enabled: false, strategy: "round-robin", providerFilter: "cross-provider", allowedProviders: [] },
        }),
      );
      expect(formatPromptOutput("starship")).toBeNull();
    });
  });
});
