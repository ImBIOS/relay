import { describe, expect, it } from "bun:test";
import {
  getActiveProvider,
  getConfigDir,
  getConfigPath,
  getUsageHistory,
  loadConfig,
} from "./settings";

describe("settings", () => {
  describe("getConfigDir", () => {
    it("should return config directory path", () => {
      const configDir = getConfigDir();
      expect(configDir).toContain(".claude");
    });
  });

  describe("getConfigPath", () => {
    it("should return config file path", () => {
      const configPath = getConfigPath();
      expect(configPath).toContain(".claude");
      expect(configPath).toContain("relay.json");
    });
  });

  describe("loadConfig", () => {
    it("should return config object", () => {
      const config = loadConfig();
      // Config file exists and is loaded
      expect(config).toBeDefined();
    });
  });

  describe("getActiveProvider", () => {
    it("should return a valid provider", () => {
      const provider = getActiveProvider();
      // Returns 'zai' as default when no provider in config
      expect(["zai", "minimax"]).toContain(provider);
    });
  });

  describe("getUsageHistory", () => {
    it("should return array for provider", () => {
      const history = getUsageHistory("zai");
      expect(Array.isArray(history)).toBe(true);
    });
  });
});
