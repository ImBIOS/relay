import { BaseCommand } from "../oclif/base";
import { Args, Flags } from "@oclif/core";
import {
  getAllProviders,
  getProviderCustomHeaders,
  type ModelDefinition,
} from "../config/provider-registry";
import { loadConfig } from "../config/accounts-config";
import {
  loadModelsCache,
  updateProviderCache,
  addUserModel,
  removeUserModel,
  clearUserModels,
  hasUserOverrides,
  isCacheFresh,
} from "../config/models-cache";
import { dim, heading, divider, ok, warn } from "../utils/console";

export default class Models extends BaseCommand<typeof Models> {
  static description = "List, add, or refresh models for providers";
  static examples = [
    "<%= config.bin %> models",
    "<%= config.bin %> models --provider copilot",
    "<%= config.bin %> models refresh",
    "<%= config.bin %> models refresh --provider copilot",
    "<%= config.bin %> models add zai --id glm-6 --name 'GLM-6' --context 512000",
    "<%= config.bin %> models remove zai --id glm-4.3",
    "<%= config.bin %> models reset zai",
  ];

  static flags = {
    provider: Flags.string({ description: "Target a specific provider" }),
    fetch: Flags.boolean({ default: false, description: "Force fetch from provider API" }),
    json: Flags.boolean({ default: false, description: "Output as JSON" }),
    // add/remove flags
    id: Flags.string({ description: "Model ID (for add/remove)" }),
    name: Flags.string({ description: "Model display name (for add)" }),
    description: Flags.string({ description: "Model description (for add)" }),
    context: Flags.integer({ description: "Context length in tokens (for add)" }),
    tools: Flags.boolean({ default: false, description: "Model supports tool calls (for add)" }),
    reasoning: Flags.boolean({ default: false, description: "Model supports reasoning (for add)" }),
  };

  static args = {
    action: Args.string({
      description: "Action: refresh, add, remove, reset, or list (default)",
      options: ["refresh", "add", "remove", "reset"],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Models);
    const action = args.action as string | undefined;

    switch (action) {
      case "refresh":
        return this.runRefresh(flags);
      case "add":
        return this.runAdd(flags);
      case "remove":
        return this.runRemove(flags);
      case "reset":
        return this.runReset(flags);
      default:
        return this.runList(flags);
    }
  }

  // ── LIST (default) ─────────────────────────────────────────────────────────
  private async runList(flags: Record<string, unknown>): Promise<void> {
    const providerFlag = flags.provider as string | undefined;
    const fetch = flags.fetch as boolean;
    const json = flags.json as boolean;

    const providers = providerFlag
      ? getAllProviders().filter((p) => p.id === providerFlag)
      : getAllProviders();

    if (providers.length === 0) {
      console.error(`Unknown provider: ${providerFlag}`);
      this.exit(1);
    }

    const config = loadConfig();
    const activeProvider = config.accounts[config.activeAccountId ?? ""]?.provider;

    if (json) {
      const result: Record<string, ModelDefinition[]> = {};
      for (const provider of providers) {
        result[provider.id] = await this.resolveModels(provider.id, provider.models, fetch);
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
      const overridden = hasUserOverrides(provider.id);
      const overrideLabel = overridden ? dim(" [user-defined]") : "";
      console.log(`\n  ${provider.displayName}${dim(marker)}${overrideLabel}`);

      const models = await this.resolveModels(provider.id, provider.models, fetch);

      if (models.length === 0) {
        if (typeof provider.models === "string" && provider.models.startsWith("http")) {
          console.log(`    ${dim(`Use 'relay models refresh --provider ${provider.id}' to fetch models.`)}`);
        } else {
          console.log(`    ${dim("No models configured.")}`);
        }
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

  // ── REFRESH ────────────────────────────────────────────────────────────────
  private async runRefresh(flags: Record<string, unknown>): Promise<void> {
    const providerFlag = flags.provider as string | undefined;
    const providers = providerFlag
      ? getAllProviders().filter((p) => p.id === providerFlag)
      : getAllProviders().filter((p) => typeof p.models === "string" && p.models.startsWith("http"));

    if (providers.length === 0) {
      if (providerFlag) {
        const p = getAllProviders().find((p) => p.id === providerFlag);
        if (p && Array.isArray(p.models)) {
          console.log(warn(`  ${p.displayName} uses a static model list. No URL to fetch from.`));
          console.log(dim(`  Use 'relay models add ${providerFlag} --id <model-id> --name <name>' to add models manually.`));
          return;
        }
        console.error(`Unknown provider: ${providerFlag}`);
        this.exit(1);
      }
      console.log(warn("  No providers with dynamic model URLs found."));
      return;
    }

    console.log("");
    console.log(heading("Refreshing Models"));
    console.log(divider("─", 60));

    for (const provider of providers) {
      const url = provider.models as string;
      process.stdout.write(`  ${provider.cliLabel.padEnd(20)} `);
      try {
        const models = await this.fetchModelsFromUrl(provider.id, url);
        if (models.length > 0) {
          updateProviderCache(provider.id, { fetched: models, fetchedAt: new Date().toISOString() });
          console.log(ok(`${models.length} models`));
        } else {
          console.log(warn("no models returned (check credentials)"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(warn(`failed: ${msg}`));
      }
    }

    console.log("");
    console.log(dim("  Models cached. Use 'relay models' to view them."));
  }

  // ── ADD ────────────────────────────────────────────────────────────────────
  private runAdd(flags: Record<string, unknown>): void {
    const providerFlag = flags.provider as string | undefined;
    if (!providerFlag) {
      console.error("Error: --provider is required for add. Example: relay models add zai --id glm-6 --name 'GLM-6'");
      this.exit(1);
    }

    const modelId = flags.id as string | undefined;
    if (!modelId) {
      console.error("Error: --id is required for add. Example: relay models add zai --id glm-6 --name 'GLM-6'");
      this.exit(1);
    }

    const model: ModelDefinition = {
      id: modelId,
      name: (flags.name as string) || modelId,
      description: flags.description as string | undefined,
      contextLength: flags.context as number | undefined,
      toolsSupported: flags.tools as boolean,
      supportsReasoning: flags.reasoning as boolean,
    };

    addUserModel(providerFlag, model);
    console.log(ok(`  Added model '${modelId}' to ${providerFlag}.`));
    console.log(dim(`  Use 'relay models --provider ${providerFlag}' to view.`));
  }

  // ── REMOVE ─────────────────────────────────────────────────────────────────
  private runRemove(flags: Record<string, unknown>): void {
    const providerFlag = flags.provider as string | undefined;
    if (!providerFlag) {
      console.error("Error: --provider is required for remove.");
      this.exit(1);
    }

    const modelId = flags.id as string | undefined;
    if (!modelId) {
      console.error("Error: --id is required for remove.");
      this.exit(1);
    }

    const removed = removeUserModel(providerFlag, modelId);
    if (removed) {
      console.log(ok(`  Removed model '${modelId}' from ${providerFlag}.`));
    } else {
      console.log(warn(`  Model '${modelId}' not found in user overrides for ${providerFlag}.`));
    }
  }

  // ── RESET ──────────────────────────────────────────────────────────────────
  private runReset(flags: Record<string, unknown>): void {
    const providerFlag = flags.provider as string | undefined;
    if (!providerFlag) {
      console.error("Error: --provider is required for reset.");
      this.exit(1);
    }

    clearUserModels(providerFlag);
    console.log(ok(`  Reset models for ${providerFlag} to defaults.`));
    console.log(dim("  User overrides cleared. Built-in or cached models will be used."));
  }

  // ── Model Resolution ───────────────────────────────────────────────────────
  private async resolveModels(
    providerId: string,
    builtInModels: string | ModelDefinition[],
    forceFetch: boolean,
  ): Promise<ModelDefinition[]> {
    const cache = loadModelsCache();
    const providerCache = cache.providers[providerId];

    // 1. User overrides always win
    if (providerCache?.userOverrides && providerCache.userOverrides.length > 0) {
      return providerCache.userOverrides;
    }

    // 2. Cached fetch (if still fresh)
    if (providerCache?.fetched && providerCache.fetchedAt && providerCache.fetched.length > 0) {
      if (!forceFetch || isCacheFresh(providerId)) {
        return providerCache.fetched;
      }
    }

    // 3. Built-in static list
    if (Array.isArray(builtInModels) && builtInModels.length > 0) {
      return builtInModels;
    }

    // 4. If it's a URL and --fetch requested, try fetching live
    if (typeof builtInModels === "string" && builtInModels.startsWith("http") && forceFetch) {
      try {
        const fetched = await this.fetchModelsFromUrl(providerId, builtInModels);
        if (fetched.length > 0) {
          updateProviderCache(providerId, { fetched, fetchedAt: new Date().toISOString() });
          return fetched;
        }
      } catch {
        // Fall through
      }
    }

    return [];
  }

  // ── Fetch from URL ─────────────────────────────────────────────────────────
  private async fetchModelsFromUrl(providerId: string, url: string): Promise<ModelDefinition[]> {
    const config = loadConfig();
    const account = Object.values(config.accounts).find((a) => a.provider === providerId);

    const headers: Record<string, string> = { Accept: "application/json" };

    if (account?.apiKey) {
      headers["Authorization"] = `Bearer ${account.apiKey}`;
    }

    // Provider-specific headers from registry
    const customHeaders = getProviderCustomHeaders(providerId);
    for (const [key, value] of Object.entries(customHeaders)) {
      headers[key] = value;
    }

    // Copilot: prefer oauthToken for model listing
    if (providerId === "copilot" && account?.oauthToken) {
      headers["Authorization"] = `Bearer ${account.oauthToken}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return [];

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
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M ctx`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K ctx`;
    return `${tokens} ctx`;
  }
}
