import { getDefaultBaseUrl } from "../config/provider-metadata";
import type { Provider, ProviderConfig, UsageOptions, UsageStats } from "./base";

/**
 * GitHub Copilot provider.
 *
 * Uses the GitHub Copilot Chat Completions API (OpenAI-compatible format).
 * Authentication: Fine-grained PAT with "Copilot Requests" permission,
 * or OAuth device flow → session token (30-min TTL).
 *
 * Unlike ZAI/MiniMax, Copilot does NOT expose an Anthropic-compatible endpoint.
 * The proxy must translate between Anthropic wire format (used by Claude Code)
 * and OpenAI Chat Completions format (used by Copilot).
 *
 * Usage data is fetched from the copilot_internal/user API endpoint,
 * which returns quota snapshots for premium interactions, chat, and completions.
 */
export class CopilotProvider implements Provider {
  name = "copilot";
  displayName = "GitHub Copilot";

  getConfig(): ProviderConfig {
    return {
      apiKey: process.env.GITHUB_COPILOT_TOKEN || "",
      baseUrl: process.env.GITHUB_COPILOT_BASE_URL || getDefaultBaseUrl("copilot"),
    };
  }

  async testConnection(): Promise<boolean> {
    const config = this.getConfig();
    if (!config.apiKey) return false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${config.baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "editor-version": "relay-cli/1.0",
          "Copilot-Integration-Id": "vscode-chat",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch usage data from GitHub Copilot's internal user API.
   *
   * Uses GET https://api.github.com/copilot_internal/user which returns
   * quota snapshots for premium_interactions, chat, and completions.
   *
   * This endpoint works with both PAT and OAuth session tokens.
   */
  async getUsage(options?: UsageOptions): Promise<UsageStats> {
    const config = this.getConfig();
    const apiKey = options?.apiKey || config.apiKey;

    if (!apiKey) {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch("https://api.github.com/copilot_internal/user", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "editor-version": "relay-cli/1.0",
          "Copilot-Integration-Id": "vscode-chat",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
      }

      const data = (await response.json()) as CopilotUserResponse;

      clearTimeout(timeoutId);

      // Extract premium interactions quota (the main metered usage)
      const premium = data.quota_snapshots?.premium_interactions;
      if (!premium) {
        return {
          used: 0,
          limit: 0,
          remaining: 0,
          percentUsed: 0,
          resetsAt: data.quota_reset_date_utc ?? undefined,
        };
      }

      const entitlement = premium.entitlement ?? 0;
      const percentRemaining = premium.percent_remaining ?? 100;
      const percentUsed = Math.max(0, 100 - percentRemaining);
      const used = entitlement - (premium.remaining ?? 0);

      return {
        used,
        limit: entitlement,
        remaining: premium.remaining ?? 0,
        percentUsed,
        resetsAt: data.quota_reset_date_utc ?? undefined,
        // Store Copilot-specific metadata for display
        copilotPlan: data.copilot_plan,
        copilotChat: data.quota_snapshots?.chat
          ? {
              percentRemaining: data.quota_snapshots.chat.percent_remaining ?? 100,
              unlimited: data.quota_snapshots.chat.unlimited ?? false,
            }
          : undefined,
        copilotCompletions: data.quota_snapshots?.completions
          ? {
              percentRemaining: data.quota_snapshots.completions.percent_remaining ?? 100,
              unlimited: data.quota_snapshots.completions.unlimited ?? false,
            }
          : undefined,
      };
    } catch {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }
  }

  /**
   * Fetch the list of available models from GitHub Copilot.
   * Returns an array of model ID strings.
   */
  async listModels(apiKey?: string): Promise<string[]> {
    const config = this.getConfig();
    const key = apiKey || config.apiKey;
    if (!key) return [];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${config.baseUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "editor-version": "relay-cli/1.0",
          "Copilot-Integration-Id": "vscode-chat",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return [];

      const data = (await response.json()) as {
        data?: Array<{ id: string }>;
      };

      return data.data?.map((m) => m.id) ?? [];
    } catch {
      return [];
    }
  }
}

export const copilotProvider = new CopilotProvider();

/**
 * Response shape from GET https://api.github.com/copilot_internal/user
 */
interface CopilotUserResponse {
  copilot_plan?: string;
  quota_reset_date?: string;
  quota_reset_date_utc?: string;
  quota_snapshots?: {
    chat?: {
      entitlement?: number;
      percent_remaining?: number;
      remaining?: number;
      unlimited?: boolean;
    };
    completions?: {
      entitlement?: number;
      percent_remaining?: number;
      remaining?: number;
      unlimited?: boolean;
    };
    premium_interactions?: {
      entitlement?: number;
      percent_remaining?: number;
      remaining?: number;
      unlimited?: boolean;
      overage_count?: number;
      overage_permitted?: boolean;
    };
  };
}
