import { testAnthropicConnection } from "../utils/anthropic-connection-test";
import type {
  Provider,
  ProviderConfig,
  UsageOptions,
  UsageStats,
} from "./base";

export class ZAIProvider implements Provider {
  name = "zai";
  displayName = "Z.AI (GLM)";

  getConfig(): ProviderConfig {
    return {
      apiKey: process.env.ZAI_API_KEY || "",
      baseUrl: process.env.ZAI_BASE_URL || "https://api.z.ai/api/anthropic",
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
      "ZAI"
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

      const response = await fetch(
        "https://api.z.ai/api/monitor/usage/quota/limit",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
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
          }>;
        };
      };

      // Get both TIME_LIMIT (MCP usage) and TOKENS_LIMIT (model usage)
      const timeLimit = data.data?.limits?.find(
        (limit) => limit.type === "TIME_LIMIT"
      );
      const tokenLimit = data.data?.limits?.find(
        (limit) => limit.type === "TOKENS_LIMIT"
      );

      if (!(timeLimit || tokenLimit)) {
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
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
      const combinedPercent = Math.max(
        modelUsage.percentUsed,
        mcpUsage.percentUsed
      );
      return {
        used: modelUsage.used + mcpUsage.used,
        limit: modelUsage.limit + mcpUsage.limit,
        remaining: modelUsage.remaining + mcpUsage.remaining,
        percentUsed: combinedPercent,
        modelUsage,
        mcpUsage,
      };
    } catch {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }
  }
}

export const zaiProvider = new ZAIProvider();
