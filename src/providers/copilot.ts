import { getDefaultBaseUrl } from "../config/provider-metadata";
import type { Provider, ProviderConfig, UsageOptions, UsageStats } from "./base";

/**
 * GitHub Copilot provider.
 *
 * Uses the GitHub Copilot Chat Completions API (OpenAI-compatible format).
 * Authentication: Fine-grained PAT with "Copilot Requests" permission.
 *
 * Unlike ZAI/MiniMax, Copilot does NOT expose an Anthropic-compatible endpoint.
 * The proxy must translate between Anthropic wire format (used by Claude Code)
 * and OpenAI Chat Completions format (used by Copilot).
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
   * GitHub Copilot is subscription-based — no quota REST endpoint exists.
   * Returns a stub indicating subscription status.
   */
  async getUsage(_options?: UsageOptions): Promise<UsageStats> {
    return {
      used: 0,
      limit: 0,
      remaining: 0,
      percentUsed: 0,
    };
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
