import type { Provider, ProviderConfig, UsageOptions, UsageStats } from "./base";

/**
 * Cursor provider.
 *
 * Uses the Cursor dashboard API to fetch usage data.
 * Authentication: WorkOS session token (obtained from browser cookies).
 *
 * The "apiKey" field stores the WorkosCursorSessionToken cookie value.
 * This token can be obtained from browser DevTools > Application > Cookies >
 * cursor.com > WorkosCursorSessionToken.
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

export class CursorProvider implements Provider {
  name = "cursor";
  displayName = "Cursor";

  getConfig(): ProviderConfig {
    return {
      apiKey: process.env.CURSOR_API_KEY || "",
      baseUrl: "https://cursor.com",
    };
  }

  async testConnection(): Promise<boolean> {
    const config = this.getConfig();
    if (!config.apiKey) return false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch("https://cursor.com/api/usage-summary", {
        method: "GET",
        headers: {
          Cookie: `WorkosCursorSessionToken=${config.apiKey}`,
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getUsage(options?: UsageOptions): Promise<UsageStats> {
    const config = this.getConfig();
    const apiKey = options?.apiKey || config.apiKey;

    if (!apiKey) {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch("https://cursor.com/api/usage-summary", {
        method: "GET",
        headers: {
          Cookie: `WorkosCursorSessionToken=${apiKey}`,
          Accept: "application/json",
          Referer: "https://cursor.com/dashboard",
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
      }

      const data = (await response.json()) as CursorUsageResponse;

      clearTimeout(timeoutId);

      const plan = data.individualUsage?.plan;
      if (!plan) {
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
      }

      const percentUsed = plan.totalPercentUsed ?? 0;
      const used = plan.used ?? 0;
      const limit = plan.limit ?? 0;
      const remaining = plan.remaining ?? 0;

      return {
        used,
        limit,
        remaining,
        percentUsed,
        resetsAt: data.billingCycleEnd || undefined,
        // Cursor-specific metadata for display
        membershipType: data.membershipType,
        isUnlimited: data.isUnlimited,
        autoPercentUsed: plan.autoPercentUsed,
        apiPercentUsed: plan.apiPercentUsed,
      };
    } catch {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }
  }
}

export const cursorProvider = new CursorProvider();
