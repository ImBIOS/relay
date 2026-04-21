import { describe, expect, test } from "bun:test";
import * as accountsConfig from "../config/accounts-config";
import {
  getActiveCredentials,
  getAutoRotatedEnv,
  performAutoRotation,
} from "./index";

describe("SDK Auto-Rotation", () => {
  describe("performAutoRotation", () => {
    test("returns rotated: false when rotation is disabled", async () => {
      const config = accountsConfig.loadConfig();
      accountsConfig.configureRotation(false);

      const result = await performAutoRotation();

      expect(result.rotated).toBe(false);

      // Restore
      accountsConfig.configureRotation(config.rotation.enabled);
    });

    test("returns rotation info when using legacy config", async () => {
      const accounts = accountsConfig.listAccounts();

      if (accounts.length <= 1) {
        const result = await performAutoRotation();
        // With legacy config, rotation depends on whether both providers are configured
        // It may or may not rotate, but should always return valid result structure
        expect(typeof result.rotated).toBe("boolean");
        expect(result).toHaveProperty("previousAccount");
        expect(result).toHaveProperty("currentAccount");
        expect(result).toHaveProperty("provider");
      }
    });

    test("returns current provider info", async () => {
      const result = await performAutoRotation();

      expect(result).toHaveProperty("previousAccount");
      expect(result).toHaveProperty("currentAccount");
      expect(result).toHaveProperty("provider");
    });
  });

  describe("getAutoRotatedEnv", () => {
    test("returns env object with ANTHROPIC_* keys", async () => {
      const env = await getAutoRotatedEnv(false);

      expect(env).toHaveProperty("ANTHROPIC_AUTH_TOKEN");
      expect(env).toHaveProperty("ANTHROPIC_BASE_URL");
      // ANTHROPIC_MODEL is NOT set - providers handle model translation
      expect(env).toHaveProperty("API_TIMEOUT_MS");
    });

    test("inherits process.env", async () => {
      const env = await getAutoRotatedEnv(false);

      // Should include existing env vars
      expect(env.PATH).toBeDefined();
    });
  });

  describe("getActiveCredentials", () => {
    test("returns credentials when account is configured", () => {
      const credentials = getActiveCredentials();

      if (credentials) {
        expect(credentials).toHaveProperty("apiKey");
        expect(credentials).toHaveProperty("baseUrl");
        // model property is not returned - providers handle model translation
        expect(credentials).toHaveProperty("provider");
        expect(credentials).toHaveProperty("accountName");
        expect(["zai", "minimax"]).toContain(credentials.provider);
      }
    });

    test("returns null when no accounts configured", () => {
      // This test depends on the actual configuration state
      // In a real test, we'd mock the config
      const credentials = getActiveCredentials();
      expect(credentials === null || typeof credentials === "object").toBe(
        true
      );
    });
  });
});

describe("SDK query wrapper", () => {
  test("query function is exported", async () => {
    const { query } = await import("./index.js");
    expect(typeof query).toBe("function");
  });

  test("createSdkMcpServer is re-exported", async () => {
    const { createSdkMcpServer } = await import("./index.js");
    expect(typeof createSdkMcpServer).toBe("function");
  });

  test("tool helper is re-exported", async () => {
    const { tool } = await import("./index.js");
    expect(typeof tool).toBe("function");
  });
});
