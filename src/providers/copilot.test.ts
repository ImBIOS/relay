import { describe, expect, it, mock } from "bun:test";
import { CopilotProvider } from "./copilot";

describe("CopilotProvider", () => {
  const provider = new CopilotProvider();

  it("should have correct name and displayName", () => {
    expect(provider.name).toBe("copilot");
    expect(provider.displayName).toBe("GitHub Copilot");
  });

  it("should return config from environment variables", () => {
    const originalToken = process.env.GITHUB_COPILOT_TOKEN;
    const originalUrl = process.env.GITHUB_COPILOT_BASE_URL;

    process.env.GITHUB_COPILOT_TOKEN = "test-token";
    process.env.GITHUB_COPILOT_BASE_URL = "https://custom.api.com";

    const config = provider.getConfig();
    expect(config.apiKey).toBe("test-token");
    expect(config.baseUrl).toBe("https://custom.api.com");

    // Restore
    if (originalToken) process.env.GITHUB_COPILOT_TOKEN = originalToken;
    else delete process.env.GITHUB_COPILOT_TOKEN;
    if (originalUrl) process.env.GITHUB_COPILOT_BASE_URL = originalUrl;
    else delete process.env.GITHUB_COPILOT_BASE_URL;
  });

  it("should return default base URL when env var not set", () => {
    delete process.env.GITHUB_COPILOT_BASE_URL;
    const config = provider.getConfig();
    expect(config.baseUrl).toBe("https://api.githubcopilot.com");
  });

  it("should return empty config when no env vars set", () => {
    delete process.env.GITHUB_COPILOT_TOKEN;
    delete process.env.GITHUB_COPILOT_BASE_URL;
    const config = provider.getConfig();
    expect(config.apiKey).toBe("");
    expect(config.baseUrl).toBe("https://api.githubcopilot.com");
  });

  it("should return subscription stub for usage", async () => {
    const usage = await provider.getUsage();
    expect(usage.used).toBe(0);
    expect(usage.limit).toBe(0);
    expect(usage.remaining).toBe(0);
    expect(usage.percentUsed).toBe(0);
  });

  it("should return false for testConnection with no API key", async () => {
    delete process.env.GITHUB_COPILOT_TOKEN;
    const result = await provider.testConnection();
    expect(result).toBe(false);
  });

  it("should return empty model list with no API key", async () => {
    delete process.env.GITHUB_COPILOT_TOKEN;
    const models = await provider.listModels();
    expect(models).toEqual([]);
  });
});
