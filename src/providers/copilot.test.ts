import { describe, expect, it, mock } from "bun:test";
import { CopilotProvider } from "./copilot";

// Mock fetch for usage tests
const originalFetch = globalThis.fetch;

function mockFetch(response: unknown, ok = true, status = 200) {
  const resp = new Response(JSON.stringify(response), { status });
  Object.defineProperty(resp, "ok", { value: ok });
  globalThis.fetch = mock(async () => Promise.resolve(resp)) as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

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

  it("should return empty usage when no API key", async () => {
    delete process.env.GITHUB_COPILOT_TOKEN;
    const usage = await provider.getUsage();
    expect(usage.used).toBe(0);
    expect(usage.limit).toBe(0);
    expect(usage.remaining).toBe(0);
    expect(usage.percentUsed).toBe(0);
  });

  it("should parse copilot_internal/user response correctly", async () => {
    process.env.GITHUB_COPILOT_TOKEN = "test-token";

    mockFetch({
      copilot_plan: "individual_pro",
      quota_reset_date: "2026-02-01",
      quota_reset_date_utc: "2026-02-01T00:00:00.000Z",
      quota_snapshots: {
        chat: { percent_remaining: 100.0, remaining: 0, unlimited: true },
        completions: { percent_remaining: 100.0, remaining: 0, unlimited: true },
        premium_interactions: {
          entitlement: 1500,
          percent_remaining: 88.5,
          remaining: 1327,
          unlimited: false,
        },
      },
    });

    const usage = await provider.getUsage({ apiKey: "test-key" });

    expect(usage.used).toBe(173); // 1500 - 1327
    expect(usage.limit).toBe(1500);
    expect(usage.remaining).toBe(1327);
    expect(usage.percentUsed).toBeCloseTo(11.5, 1); // 100 - 88.5
    expect(usage.copilotPlan).toBe("individual_pro");
    expect(usage.copilotChat?.unlimited).toBe(true);
    expect(usage.copilotChat?.percentRemaining).toBe(100);
    expect(usage.copilotCompletions?.unlimited).toBe(true);
    expect(usage.resetsAt).toBe("2026-02-01T00:00:00.000Z");

    restoreFetch();
    delete process.env.GITHUB_COPILOT_TOKEN;
  });

  it("should handle missing premium_interactions gracefully", async () => {
    process.env.GITHUB_COPILOT_TOKEN = "test-token";

    mockFetch({
      copilot_plan: "individual_pro",
      quota_reset_date_utc: "2026-02-01T00:00:00.000Z",
      quota_snapshots: {
        chat: { percent_remaining: 100.0, unlimited: true },
      },
    });

    const usage = await provider.getUsage({ apiKey: "test-key" });

    expect(usage.used).toBe(0);
    expect(usage.limit).toBe(0);
    expect(usage.remaining).toBe(0);
    expect(usage.percentUsed).toBe(0);
    expect(usage.resetsAt).toBe("2026-02-01T00:00:00.000Z");

    restoreFetch();
    delete process.env.GITHUB_COPILOT_TOKEN;
  });

  it("should handle API error gracefully", async () => {
    process.env.GITHUB_COPILOT_TOKEN = "test-token";

    mockFetch({ message: "Unauthorized" }, false, 401);

    const usage = await provider.getUsage({ apiKey: "test-key" });

    expect(usage.used).toBe(0);
    expect(usage.limit).toBe(0);
    expect(usage.remaining).toBe(0);
    expect(usage.percentUsed).toBe(0);

    restoreFetch();
    delete process.env.GITHUB_COPILOT_TOKEN;
  });

  it("should use oauthToken as primary token for usage", async () => {
    process.env.GITHUB_COPILOT_TOKEN = "tid=copilot-session-token";
    let capturedToken = "";
    const originalFetch2 = globalThis.fetch;

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      // Capture the Authorization header from the second attempt
      const authHeader = init?.headers instanceof Headers
        ? init.headers.get("Authorization")
        : (init?.headers as Record<string, string>)?.["Authorization"];
      capturedToken = authHeader ?? "";
      // First call (with Copilot session token) fails, second call succeeds
      if (capturedToken.startsWith("Bearer tid=")) {
        return new Response(JSON.stringify({ message: "Bad credentials" }), { status: 401 });
      }
      return new Response(JSON.stringify({
        copilot_plan: "individual_pro",
        quota_reset_date_utc: "2026-06-01T00:00:00.000Z",
        quota_snapshots: {
          chat: { percent_remaining: 100.0, unlimited: true },
          completions: { percent_remaining: 100.0, unlimited: true },
          premium_interactions: {
            entitlement: 300,
            percent_remaining: 77.6,
            remaining: 233,
            unlimited: false,
          },
        },
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const usage = await provider.getUsage({
      // Copilot session token (tid=...) — will fail on api.github.com
      apiKey: "tid=copilot-session-token;exp=999",
      // GitHub PAT — will succeed
      oauthToken: "gho_test-github-pat-token",
    });

    expect(usage.limit).toBe(300);
    expect(usage.remaining).toBe(233);
    expect(usage.percentUsed).toBeCloseTo(22.4, 1);
    expect(usage.copilotPlan).toBe("individual_pro");
    expect(usage.copilotChat?.unlimited).toBe(true);
    expect(usage.copilotCompletions?.unlimited).toBe(true);
    expect(usage.resetsAt).toBe("2026-06-01T00:00:00.000Z");

    globalThis.fetch = originalFetch2;
    delete process.env.GITHUB_COPILOT_TOKEN;
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
