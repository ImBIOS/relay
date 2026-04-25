import { getDefaultBaseUrl } from "../config/provider-metadata";
import { testAnthropicConnection } from "../utils/anthropic-connection-test";
import type {
  Provider,
  ProviderConfig,
  UsageOptions,
  UsageStats,
  WeeklyUsageStats,
} from "./base";

export class MiniMaxProvider implements Provider {
  name = "minimax";
  displayName = "MiniMax";

  getConfig(): ProviderConfig {
    return {
      apiKey: process.env.MINIMAX_API_KEY || "",
      baseUrl: process.env.MINIMAX_BASE_URL || getDefaultBaseUrl("minimax"),
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
      "MiniMax"
    );
  }

  async getUsage(options?: UsageOptions): Promise<UsageStats> {
    const config = this.getConfig();
    const apiKey = options?.apiKey || config.apiKey;

    if (!apiKey) {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }

    // Get groupId from options, account config, or environment variable
    const groupId = options?.groupId || process.env.MINIMAX_GROUP_ID || "";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      // TODO: `groupId` is mandatory, it should not optional, it should throw error or something
      const url = groupId
        ? `https://platform.minimax.io/v1/api/openplatform/coding_plan/remains?GroupId=${groupId}`
        : "https://platform.minimax.io/v1/api/openplatform/coding_plan/remains";

      const response = await fetch(url, {
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
        model_remains?: Array<{
          start_time: number; // Unix timestamp in ms
          end_time: number; // Unix timestamp in ms (reset time)
          remains_time: number; // ms remaining until reset
          current_interval_total_count: number;
          current_interval_usage_count: number;
          model_name: string;
          // Weekly limits
          current_weekly_total_count?: number;
          current_weekly_usage_count?: number;
          weekly_start_time?: number; // Unix timestamp in ms
          weekly_end_time?: number; // Unix timestamp in ms
          weekly_remains_time?: number; // ms remaining until weekly reset
        }>;
        base_resp?: { status_code: number };
      };

      // Check if request was successful
      if (data.base_resp?.status_code !== 0 || !data.model_remains?.[0]) {
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
      }

      const modelRemains = data.model_remains[0];
      const limit = modelRemains.current_interval_total_count;
      const remaining = modelRemains.current_interval_usage_count; // This field is actually "remaining", not "used"
      const used = Math.max(0, limit - remaining);
      const percentUsed = limit > 0 ? (used / limit) * 100 : 0;
      const percentRemaining = limit > 0 ? (remaining / limit) * 100 : 0;

      // Extract reset time from end_time (Unix timestamp in milliseconds)
      // Extract reset time from end_time (Unix timestamp in milliseconds)
      const resetsAt = modelRemains.end_time
        ? new Date(modelRemains.end_time).toISOString()
        : undefined;

      // Extract weekly limits if available
      let weeklyUsage: WeeklyUsageStats | undefined;
      if (
        modelRemains.current_weekly_total_count &&
        modelRemains.current_weekly_total_count > 0
      ) {
        const weeklyLimit = modelRemains.current_weekly_total_count;
        const weeklyUsed = modelRemains.current_weekly_usage_count ?? 0;
        weeklyUsage = {
          used: weeklyUsed,
          limit: weeklyLimit,
          remaining: Math.max(0, weeklyLimit - weeklyUsed),
          percentUsed:
            weeklyLimit > 0 ? (weeklyUsed / weeklyLimit) * 100 : 0,
          resetsAt: modelRemains.weekly_end_time
            ? new Date(modelRemains.weekly_end_time).toISOString()
            : undefined,
        };
      }

      return {
        used,
        limit,
        remaining,
        percentUsed,
        // For MiniMax, display remaining percentage (like web interface)
        percentRemaining,
        resetsAt,
        weeklyUsage,
      };
    } catch {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
    }
  }
}

export const minimaxProvider = new MiniMaxProvider();
