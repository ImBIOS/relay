import type { Provider, ProviderConfig, UsageOptions, UsageStats } from "./base";
import { getCursorSessionToken, readCursorCliConfig } from "../utils/cursor-auth";
import { trace } from "../utils/logger";

/**
 * Cursor provider.
 *
 * Supports two authentication methods:
 *
 * 1. **User API key** (crsr_...): Works with api.cursor.com/v1/* endpoints.
 *    Created from Cursor Dashboard → API Keys. This key type does NOT have
 *    access to usage data — usage is only available via the web dashboard
 *    or the Admin API (which requires a team admin key).
 *
 * 2. **WorkOS session token**: The WorkosCursorSessionToken cookie value from
 *    the browser. This can be obtained from browser DevTools > Application >
 *    Cookies > cursor.com > WorkosCursorSessionToken.
 *    Format: userId::JWT
 *    This provides access to cursor.com/api/usage-summary for usage data.
 *
 * The usage API returns totalPercentUsed which represents the overall
 * usage percentage across all plan features (auto + API usage).
 */

interface CursorUsageResponse {
  billingCycleStart: string;
  billingCycleEnd: string;
  membershipType: string;
  limitType: string;
  isUnlimited: boolean;
  autoModelSelectedDisplayMessage?: string;
  namedModelSelectedDisplayMessage?: string;
  individualUsage?: {
    plan?: {
      enabled: boolean;
      used: number;
      limit: number;
      remaining: number;
      breakdown?: {
        included: number;
        bonus: number;
        total: number;
      };
      autoPercentUsed: number;
      apiPercentUsed: number;
      totalPercentUsed: number;
    };
    onDemand?: {
      enabled: boolean;
      used: number;
      limit: number | null;
      remaining: number | null;
    };
  };
  teamUsage?: Record<string, unknown>;
}

interface CursorMeResponse {
  apiKeyName: string;
  userId: number;
  createdAt: string;
  userEmail: string;
  userFirstName: string;
  userLastName: string;
}

/** Detect if the key is a user API key (crsr_ prefix) vs a session token */
function isUserApiKey(key: string): boolean {
  return key.startsWith("crsr_");
}

export class CursorProvider implements Provider {
  name = "cursor";
  displayName = "Cursor";

  getConfig(): ProviderConfig {
    return {
      apiKey: process.env.CURSOR_API_KEY || "",
      baseUrl: "https://api.cursor.com",
    };
  }

  async testConnection(): Promise<boolean> {
    const config = this.getConfig();
    if (!config.apiKey) return false;

    try {
      if (isUserApiKey(config.apiKey)) {
        // Test with api.cursor.com/v1/me (Bearer token)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch("https://api.cursor.com/v1/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
      }

      // Session token: try Bearer first (cursor-agent JWT), then cookie
      const testHeaders: Record<string, string>[] = [
        { Authorization: `Bearer ${config.apiKey}` },
        { Cookie: `WorkosCursorSessionToken=${config.apiKey}` },
      ];

      for (const headers of testHeaders) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        try {
          const response = await fetch("https://cursor.com/api/usage-summary", {
            method: "GET",
            headers: {
              ...headers,
              Accept: "application/json",
              "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          if (response.ok) return true;
        } catch {
          clearTimeout(timeoutId);
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  async getUsage(options?: UsageOptions): Promise<UsageStats> {
    const config = this.getConfig();
    let apiKey = options?.apiKey || config.apiKey;

    if (!apiKey) {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }

    // If this is a user API key (crsr_...), try to get a session token
    // from local sources (cursor-agent auth.json or Cursor IDE state DB)
    if (isUserApiKey(apiKey)) {
      trace("Cursor: stored key is a user API key, trying local session token...");
      const sessionToken = getCursorSessionToken();

      if (sessionToken && !sessionToken.isExpired) {
        trace(`Cursor: found valid ${sessionToken.source} session token for ${sessionToken.email}`);
        return this.getUsageFromSessionToken(sessionToken.token);
      }

      if (sessionToken?.isExpired) {
        trace(`Cursor: ${sessionToken.source} session token is expired`);
      }

      // Fall back to verifying the API key and showing account info
      return this.getUsageFromUserApiKey(apiKey);
    }

    // Session token: use the web dashboard API
    return this.getUsageFromSessionToken(apiKey);
  }

  /**
   * User API key (crsr_...): can authenticate but no usage endpoint available.
   * We verify the key works and return account info, but no usage data.
   */
  private async getUsageFromUserApiKey(apiKey: string): Promise<UsageStats> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch("https://api.cursor.com/v1/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
      }

      const data = (await response.json()) as CursorMeResponse;
      clearTimeout(timeoutId);

      // User API keys don't have access to usage data
      // Return a stats object that signals "connected but no usage"
      return {
        used: 0,
        limit: 0,
        remaining: 0,
        percentUsed: 0,
        membershipType: `Connected as ${data.userEmail}`,
      };
    } catch {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }
  }

  /**
   * Build the UsageStats from a Cursor usage-summary API response.
   * Returns null if the response doesn't contain usable plan data.
   */
  private parseUsageResponse(data: CursorUsageResponse): UsageStats | null {
    const plan = data.individualUsage?.plan;
    if (!plan) {
      return null;
    }

    const used = plan.used ?? 0;
    const limit = plan.limit ?? 0;
    const remaining = plan.remaining ?? 0;
    const percentUsed = limit > 0 ? (used / limit) * 100 : 0;

    return {
      used,
      limit,
      remaining,
      percentUsed,
      resetsAt: data.billingCycleEnd || undefined,
      membershipType: data.membershipType,
      isUnlimited: data.isUnlimited,
      totalPercentUsed: plan.totalPercentUsed,
      autoPercentUsed: plan.autoPercentUsed,
      apiPercentUsed: plan.apiPercentUsed,
    };
  }

  /**
   * Fetch usage-summary from cursor.com with the given headers.
   * Returns parsed stats or null on failure.
   */
  private async fetchUsageSummary(
    headers: Record<string, string>,
    label: string,
  ): Promise<UsageStats | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch("https://cursor.com/api/usage-summary", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Referer: "https://cursor.com/dashboard",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
          ...headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        trace(`Cursor ${label}: HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as CursorUsageResponse;
      clearTimeout(timeoutId);

      const stats = this.parseUsageResponse(data);
      if (!stats) {
        trace(`Cursor ${label}: response has no plan data`);
        return null;
      }

      trace(`Cursor ${label}: success`);
      return stats;
    } catch (err) {
      trace(`Cursor ${label}: ${err}`);
      return null;
    }
  }

  /**
   * Try to get usage data from a session token using multiple auth strategies.
   *
   * The token stored could be:
   * - A cursor-agent accessToken JWT (from ~/.config/cursor/auth.json) — works
   *   as a Bearer token or as userId::JWT cookie format
   * - A raw WorkosCursorSessionToken cookie value (manually pasted from
   *   browser DevTools) — works directly as the cookie
   *
   * We try strategies in order and return the first that yields data.
   */
  private async getUsageFromSessionToken(apiKey: string): Promise<UsageStats> {
    const empty: UsageStats = { used: 0, limit: 0, remaining: 0, percentUsed: 0 };

    // Strategy 1: Raw token as WorkosCursorSessionToken cookie (browser-pasted tokens)
    trace("Cursor: trying cookie auth with raw token...");
    const cookieResult = await this.fetchUsageSummary(
      { Cookie: `WorkosCursorSessionToken=${apiKey}` },
      "cookie-raw",
    );
    if (cookieResult) return cookieResult;

    // Strategy 2: Bearer token (cursor-agent accessToken JWT)
    trace("Cursor: trying Bearer auth...");
    const bearerResult = await this.fetchUsageSummary(
      { Authorization: `Bearer ${apiKey}` },
      "bearer",
    );
    if (bearerResult) return bearerResult;

    // Strategy 3: userId::JWT cookie format (cursor-agent token reformatted)
    const cliConfig = readCursorCliConfig();
    if (cliConfig?.userId) {
      trace(`Cursor: trying cookie auth with userId::JWT format (userId=${cliConfig.userId})...`);
      const formattedResult = await this.fetchUsageSummary(
        { Cookie: `WorkosCursorSessionToken=${cliConfig.userId}::${apiKey}` },
        "cookie-formatted",
      );
      if (formattedResult) return formattedResult;
    }

    // All strategies failed
    trace("Cursor: all usage auth strategies failed");
    return empty;
  }
}

export const cursorProvider = new CursorProvider();
