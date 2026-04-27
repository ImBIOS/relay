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
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch("https://api.z.ai/api/monitor/usage/quota/limit", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
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
      // number: 5 means 5 million tokens (unit=3 is millions)
      let modelUsage: UsageStats;
      if (tokenLimit) {
        // unit: 3 = millions, so number is the limit in millions of tokens
        const tokenLimit_ = tokenLimit.limit ?? tokenLimit.number * 1_000_000;
        const tokenUsed = tokenLimit.percentage
          ? Math.round((tokenLimit.percentage / 100) * tokenLimit_)
          : 0;
        modelUsage = {
          used: tokenUsed,
          limit: tokenLimit_,
          remaining: tokenLimit_ - tokenUsed,
          percentUsed: tokenLimit.percentage ?? 0,
        };
      } else {
        modelUsage = { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
      }

      // For overall usage, combine both (use the higher percentage)
      const combinedPercent = Math.max(modelUsage.percentUsed, mcpUsage.percentUsed);

      // Extract reset time from token limit (they share the same 5-hour window)
      // Extract reset time from token limit (they share the same 5-hour window)
      const resetsAt = tokenLimit?.nextResetTime
        ? new Date(tokenLimit.nextResetTime).toISOString()
        : undefined;

      // Look for weekly limit data (might be in a separate limit entry)
      let weeklyUsage: WeeklyUsageStats | undefined;
      const weeklyLimit = data.data?.limits?.find((limit) => limit.type === "WEEKLY_LIMIT");
      if (weeklyLimit && weeklyLimit.windowTotal && weeklyLimit.windowTotal > 0) {
        const weeklyUsed = weeklyLimit.windowUsed ?? 0;
        const weeklyLimit_ = weeklyLimit.windowTotal;
        weeklyUsage = {
          used: weeklyUsed,
          limit: weeklyLimit_,
          remaining: Math.max(0, weeklyLimit_ - weeklyUsed),
          percentUsed: weeklyLimit_ > 0 ? (weeklyUsed / weeklyLimit_) * 100 : 0,
          resetsAt: weeklyLimit.windowEnd
            ? new Date(weeklyLimit.windowEnd).toISOString()
            : undefined,
        };
      } else if (tokenLimit?.windowTotal && tokenLimit.windowTotal > 0) {
        // Weekly data might be embedded in token limit
        const weeklyUsed = tokenLimit.windowUsed ?? 0;
        const weeklyLimit_ = tokenLimit.windowTotal;
        weeklyUsage = {
          used: weeklyUsed,
          limit: weeklyLimit_,
          remaining: Math.max(0, weeklyLimit_ - weeklyUsed),
          percentUsed: weeklyLimit_ > 0 ? (weeklyUsed / weeklyLimit_) * 100 : 0,
          resetsAt: tokenLimit.windowEnd ? new Date(tokenLimit.windowEnd).toISOString() : undefined,
        };
      }

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
