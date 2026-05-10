import { getDefaultBaseUrl } from "../config/provider-metadata";
import { testAnthropicConnection } from "../utils/anthropic-connection-test";
import type { Provider, ProviderConfig, UsageOptions, UsageStats, WeeklyUsageStats } from "./base";

export class ZAIProvider implements Provider {
  name = "zai";
  displayName = "Z.AI (GLM)";

  getConfig(): ProviderConfig {
    return {
      apiKey: process.env.ZAI_API_KEY || "",
      baseUrl: process.env.ZAI_BASE_URL || getDefaultBaseUrl("zai"),
    };
  }

  async testConnection(): Promise<boolean> {
    const config = this.getConfig();
    return testAnthropicConnection(
      {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: "",
      },
      "ZAI",
    );
  }

  async getUsage(options?: UsageOptions): Promise<UsageStats> {
    const config = this.getConfig();
    const apiKey = options?.apiKey || config.apiKey;

    if (!apiKey) {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s for full round-trip

      const response = await fetch("https://api.z.ai/api/monitor/usage/quota/limit", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
      }

      const data = (await response.json()) as {
        code: number;
        data?: {
          limits?: Array<{
            type: string;
            usage: number;
            currentValue: number;
            remaining: number;
            percentage: number;
            nextResetTime?: number; // Unix timestamp in milliseconds
            windowStart?: number; // Weekly window start (ms)
            windowEnd?: number; // Weekly window end (ms)
            windowTotal?: number; // Weekly total limit
            windowUsed?: number; // Weekly used amount
          }>;
        };
      };

      // Get both TIME_LIMIT (MCP usage) and TOKENS_LIMIT (model usage)
      const timeLimit = data.data?.limits?.find((limit) => limit.type === "TIME_LIMIT");
      const tokenLimit = data.data?.limits?.find((limit) => limit.type === "TOKENS_LIMIT");

      if (!(timeLimit || tokenLimit)) {
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
      }

      // Handle TIME_LIMIT - always has full fields (minutes)
      const mcpUsage: UsageStats = timeLimit
        ? {
            used: timeLimit.currentValue ?? 0,
            limit: timeLimit.usage ?? 0,
            remaining: timeLimit.remaining ?? 0,
            percentUsed: timeLimit.percentage ?? 0,
          }
        : { used: 0, limit: 0, remaining: 0, percentUsed: 0 };

      // Handle TOKENS_LIMIT - may only have percentage and number (limit in tokens)
      // unit: 3 = millions, so number is the limit in millions of tokens
      // unit: 6 = weekly millions (per week reset)
      const tokenLimits = data.data?.limits?.filter((limit) => limit.type === "TOKENS_LIMIT" && limit.unit === 3);
      const weeklyLimits = data.data?.limits?.filter((limit) => limit.type === "TOKENS_LIMIT" && limit.unit === 6);

      let modelUsage: UsageStats = { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
      let weeklyUsage: WeeklyUsageStats | undefined;

      for (const limit of tokenLimits ?? []) {
        const rawLimit = (limit as Record<string, unknown>).limit;
        const rawNumber = (limit as Record<string, unknown>).number;
        const tokenLimit_ = (typeof rawLimit === 'number' ? rawLimit : typeof rawNumber === 'number' ? (rawNumber as number) * 1_000_000 : 0);
        const tokenUsed = limit.percentage ? Math.round((limit.percentage / 100) * tokenLimit_) : 0;
        modelUsage = {
          used: tokenUsed,
          limit: tokenLimit_,
          remaining: tokenLimit_ - tokenUsed,
          percentUsed: limit.percentage ?? 0,
        };
      }

      // Weekly limit is TOKENS_LIMIT with unit=6 (millions per week)
      for (const limit of weeklyLimits ?? []) {
        const rawLimit = (limit as Record<string, unknown>).limit;
        const rawNumber = (limit as Record<string, unknown>).number;
        const weeklyLimit_ = (typeof rawLimit === 'number' ? rawLimit : typeof rawNumber === 'number' ? (rawNumber as number) * 1_000_000 : 0);
        const weeklyUsed = limit.percentage ? Math.round((limit.percentage / 100) * weeklyLimit_) : 0;
        weeklyUsage = {
          used: weeklyUsed,
          limit: weeklyLimit_,
          remaining: weeklyLimit_ - weeklyUsed,
          percentUsed: limit.percentage ?? 0,
          resetsAt: limit.nextResetTime ? new Date(limit.nextResetTime).toISOString() : undefined,
        };
      }

      // For overall usage, combine both (use the higher percentage)
      const combinedPercent = Math.max(modelUsage.percentUsed, mcpUsage.percentUsed);

      // Extract reset time from token limit (they share the same 5-hour window)
      const resetsAt = tokenLimits[0]?.nextResetTime
        ? new Date(tokenLimits[0].nextResetTime).toISOString()
        : undefined;

      clearTimeout(timeoutId); // Cleared AFTER response body fully consumed

      return {
        used: modelUsage.used + mcpUsage.used,
        limit: modelUsage.limit + mcpUsage.limit,
        remaining: modelUsage.remaining + mcpUsage.remaining,
        percentUsed: combinedPercent,
        modelUsage,
        mcpUsage,
        resetsAt,
        weeklyUsage,
      };
    } catch {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
    }
  }
}

export const zaiProvider = new ZAIProvider();
