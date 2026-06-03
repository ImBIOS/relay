import { getDefaultBaseUrl } from "../config/provider-metadata";
import { testAnthropicConnection } from "../utils/anthropic-connection-test";
import type { Provider, ProviderConfig, UsageOptions, UsageStats, WeeklyUsageStats } from "./base";

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
      "MiniMax",
    );
  }

  async getUsage(options?: UsageOptions): Promise<UsageStats> {
    const config = this.getConfig();
    const apiKey = options?.apiKey ?? config.apiKey;

    if (!apiKey) {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0 };
    }

    // Get groupId from options, account config, or environment variable
    const groupId = options?.groupId ?? process.env.MINIMAX_GROUP_ID;

    if (!groupId) {
      // If groupId is not provided, throw error
      throw new Error(
        "MiniMax usage tracking requires a Group ID. Please provide it via options or set the MINIMAX_GROUP_ID environment variable.",
      );
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s for full round-trip

      const url = `https://platform.minimax.io/v1/api/openplatform/coding_plan/remains`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "x-group-id": groupId,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeoutId);
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
      }

      const data = (await response.json()) as {
        model_remains?: Array<{
          start_time: number; // Unix timestamp in ms
          end_time: number; // Unix timestamp in ms (reset time)
          remains_time: number; // ms remaining until reset
          // Legacy absolute count fields (may be 0 now that the API is percentage-only)
          current_interval_total_count: number;
          current_interval_usage_count: number;
          model_name: string;
          // 5-hour window: remaining percentage (0-100). The API no longer exposes absolute counts.
          current_interval_status?: number;
          current_interval_remaining_percent?: number;
          // Weekly limits
          current_weekly_total_count?: number;
          current_weekly_usage_count?: number;
          weekly_start_time?: number; // Unix timestamp in ms
          weekly_end_time?: number; // Unix timestamp in ms
          weekly_remains_time?: number; // ms remaining until weekly reset
          current_weekly_status?: number;
          current_weekly_remaining_percent?: number; // 100 typically means unlimited
        }>;
        base_resp?: { status_code: number };
      };

      // Check if request was successful
      if (data.base_resp?.status_code !== 0 || !data.model_remains?.[0]) {
        return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
      }

      const modelRemains = data.model_remains[0];

      // Prefer the absolute counts when the API provides them; otherwise fall back
      // to the new percentage-only field (current_interval_total_count is now 0).
      const rawTotal = modelRemains.current_interval_total_count;
      const rawRemaining = modelRemains.current_interval_usage_count; // Legacy: this field is "remaining", not "used"
      const intervalRemainingPercent = modelRemains.current_interval_remaining_percent;

      let used: number;
      let limit: number;
      let remaining: number;
      let percentRemaining: number;
      let intervalPercentageOnly: boolean;

      if (rawTotal > 0) {
        // Old API shape: derive everything from absolute counts.
        limit = rawTotal;
        remaining = Math.max(0, rawRemaining);
        used = Math.max(0, limit - remaining);
        percentRemaining = limit > 0 ? (remaining / limit) * 100 : 0;
        intervalPercentageOnly = false;
      } else if (typeof intervalRemainingPercent === "number") {
        // New API shape: only percentage is exposed. The display should rely on
        // percentUsed/percentRemaining rather than the absolute counts.
        const clamped = Math.max(0, Math.min(100, intervalRemainingPercent));
        used = 0;
        limit = 0;
        remaining = 0;
        percentRemaining = clamped;
        intervalPercentageOnly = true;
      } else {
        used = 0;
        limit = 0;
        remaining = 0;
        percentRemaining = 0;
        intervalPercentageOnly = true;
      }

      const percentUsed = Math.max(0, Math.min(100, 100 - percentRemaining));

      // Extract reset time from end_time (Unix timestamp in milliseconds)
      const resetsAt = modelRemains.end_time
        ? new Date(modelRemains.end_time).toISOString()
        : undefined;

      // Extract weekly limits. The API may expose the legacy absolute counts,
      // the new percentage field, or both. When the total count is 0 and the
      // remaining percent is 100 with status 3, the weekly bucket is unlimited.
      let weeklyUsage: WeeklyUsageStats | undefined;
      const weeklyTotal = modelRemains.current_weekly_total_count ?? 0;
      const weeklyUsedRaw = modelRemains.current_weekly_usage_count ?? 0;
      const weeklyRemainingPercent = modelRemains.current_weekly_remaining_percent;
      const weeklyStatus = modelRemains.current_weekly_status;

      // Detect unlimited weekly: no concrete limit, 100% remaining, status flag 3.
      const weeklyIsUnlimited =
        weeklyTotal === 0 &&
        weeklyUsedRaw === 0 &&
        (weeklyStatus === 3 || weeklyRemainingPercent === 100) &&
        typeof weeklyRemainingPercent === "number";

      if (weeklyIsUnlimited) {
        weeklyUsage = {
          used: 0,
          limit: 0,
          remaining: 0,
          percentUsed: 0,
          unlimited: true,
          resetsAt: modelRemains.weekly_end_time
            ? new Date(modelRemains.weekly_end_time).toISOString()
            : undefined,
        };
      } else if (weeklyTotal > 0) {
        const weeklyUsed = weeklyUsedRaw;
        weeklyUsage = {
          used: weeklyUsed,
          limit: weeklyTotal,
          remaining: Math.max(0, weeklyTotal - weeklyUsed),
          percentUsed: weeklyTotal > 0 ? (weeklyUsed / weeklyTotal) * 100 : 0,
          resetsAt: modelRemains.weekly_end_time
            ? new Date(modelRemains.weekly_end_time).toISOString()
            : undefined,
        };
      } else if (typeof weeklyRemainingPercent === "number") {
        // Percentage-only weekly (no unlimited flag and no absolute count).
        const weeklyPctRemaining = Math.max(0, Math.min(100, weeklyRemainingPercent));
        weeklyUsage = {
          used: 100 - weeklyPctRemaining,
          limit: 100,
          remaining: weeklyPctRemaining,
          percentUsed: 100 - weeklyPctRemaining,
          resetsAt: modelRemains.weekly_end_time
            ? new Date(modelRemains.weekly_end_time).toISOString()
            : undefined,
        };
      }

      clearTimeout(timeoutId); // Cleared AFTER response body fully consumed

      return {
        used,
        limit,
        remaining,
        percentUsed,
        // For MiniMax, display remaining percentage (like web interface)
        percentRemaining,
        intervalPercentageOnly,
        resetsAt,
        weeklyUsage,
      };
    } catch {
      return { used: 0, limit: 0, remaining: 0, percentUsed: 0, resetsAt: undefined };
    }
  }
}

export const minimaxProvider = new MiniMaxProvider();
