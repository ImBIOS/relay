import { BaseCommand } from "../oclif/base";
import { Flags } from "@oclif/core";
import {
  getAllProviders,
  type ModelDefinition,
} from "../config/provider-registry";
import { loadConfig } from "../config/accounts-config";
import { dim, heading, divider } from "../utils/console";

export default class Models extends BaseCommand<typeof Models> {
  static description = "List available models for providers";
  static examples = [
    "<%= config.bin %> models",
    "<%= config.bin %> models --provider copilot",
    "<%= config.bin %> models --fetch",
  ];

  static flags = {
    provider: Flags.string({
      description: "Show models for a specific provider",
    }),
    fetch: Flags.boolean({
      default: false,
      description: "Fetch models dynamically from provider API (for providers with URL-based model lists)",
    }),
    json: Flags.boolean({ default: false, description: "Output as JSON" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Models);

    const providers = flags.provider
      ? getAllProviders().filter((p) => p.id === flags.provider)
      : getAllProviders();

    if (providers.length === 0) {
      console.error(`Unknown provider: ${flags.provider}`);
      this.exit(1);
    }

    const config = loadConfig();
    const activeProvider = config.accounts[config.activeAccountId ?? ""]?.provider;

    if (flags.json) {
      const result: Record<string, ModelDefinition[]> = {};
      for (const provider of providers) {
        const models = await this.resolveModels(provider.id, provider.models, flags.fetch, activeProvider);
        result[provider.id] = models;
      }
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("");
    console.log(heading("Available Models"));
    console.log(divider("─", 60));

    for (const provider of providers) {
      const isActive = provider.id === activeProvider;
      const marker = isActive ? " (active)" : "";
      console.log(`\n  ${provider.displayName}${dim(marker)}`);

      const models = await this.resolveModels(provider.id, provider.models, flags.fetch, activeProvider);

      if (models.length === 0) {
        console.log(`    ${dim("No models configured. Use --fetch to fetch from API.")}`);
        continue;
      }

      for (const model of models) {
        const tools = model.toolsSupported ? "tools" : "";
        const reasoning = model.supportsReasoning ? "reasoning" : "";
        const context = model.contextLength ? this.formatContext(model.contextLength) : "";
        const badges = [tools, reasoning, context].filter(Boolean).join(", ");

        console.log(`    ${model.id.padEnd(35)} ${badges ? dim(badges) : ""}`);
        if (model.description) {
          console.log(`    ${"".padEnd(35)} ${dim(model.description)}`);
        }
      }
    }
  }

  private async resolveModels(
    providerId: string,
    modelsSource: string | ModelDefinition[],
    fetch: boolean,
    _activeProvider?: string,
  ): Promise<ModelDefinition[]> {
    // If it's already a static list, return it
    if (Array.isArray(modelsSource)) {
      return modelsSource;
    }

    // If it's a URL and --fetch is requested, try to fetch dynamically
    if (fetch && typeof modelsSource === "string" && modelsSource.startsWith("http")) {
      try {
        const fetched = await this.fetchModelsFromUrl(providerId, modelsSource);
        if (fetched.length > 0) return fetched;
      } catch {
        // Fall through to return empty
      }
    }

    // URL-based but not fetched — show a hint
    if (typeof modelsSource === "string" && modelsSource.startsWith("http")) {
      console.log(`    ${dim(`Models fetched dynamically from ${modelsSource}`)}`);
      console.log(`    ${dim("Use --fetch to retrieve the current model list.")}`);
    }

    return [];
  }

  private async fetchModelsFromUrl(providerId: string, url: string): Promise<ModelDefinition[]> {
    // Get auth credentials from active account for this provider
    const config = loadConfig();
    const account = Object.values(config.accounts).find((a) => a.provider === providerId);

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (account?.apiKey) {
      headers["Authorization"] = `Bearer ${account.apiKey}`;
    }

    // Add provider-specific headers
    if (providerId === "copilot") {
      headers["editor-version"] = "relay-cli/1.0";
      headers["editor-plugin-version"] = "relay/1.0";
      headers["Copilot-Integration-Id"] = "vscode-chat";
      // For copilot, prefer oauthToken (gho_...) directly — it works for the models endpoint
      if (account?.oauthToken) {
        headers["Authorization"] = `Bearer ${account.oauthToken}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return [];
      }

      const data = (await response.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          description?: string;
          context_length?: number;
          max_context_window_tokens?: number;
          capabilities?: {
            supports?: { tool_calls?: boolean; parallel_tool_calls?: boolean };
            limits?: { max_context_window_tokens?: number };
            type?: string;
          };
          model_picker_enabled?: boolean;
        }>;
      };

      return (data.data ?? [])
        .filter((m) => m.model_picker_enabled !== false)
        .map((m) => ({
          id: m.id,
          name: m.name ?? m.id,
          description: m.description,
          contextLength: m.context_length ?? m.capabilities?.limits?.max_context_window_tokens ?? m.max_context_window_tokens,
          toolsSupported: m.capabilities?.supports?.tool_calls ?? false,
          supportsParallelToolCalls: m.capabilities?.supports?.parallel_tool_calls ?? false,
          supportsReasoning: false,
        }));
    } catch {
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private formatContext(tokens: number): string {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M ctx`;
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(0)}K ctx`;
    }
    return `${tokens} ctx`;
  }
}
