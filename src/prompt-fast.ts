import * as accountsConfig from "./config/accounts-config";
import { getProviderModels, type ModelDefinition } from "./config/provider-registry";

export type PromptFormat = "starship" | "zsh" | "plain";

export function parsePromptFormat(argv: string[]): PromptFormat {
  for (const arg of argv) {
    if (arg === "--format=starship" || arg === "--format" && argv.includes("starship")) {
      return "starship";
    }
    if (arg === "--format=zsh") return "zsh";
    if (arg === "--format=plain") return "plain";
    if (arg === "--format") {
      const idx = argv.indexOf(arg);
      const next = argv[idx + 1];
      if (next === "zsh" || next === "plain" || next === "starship") return next;
    }
  }
  return "starship";
}

function getModelForProvider(provider: string): string {
  const models = getProviderModels(provider);
  if (Array.isArray(models) && models.length > 0) {
    const first = models[0] as ModelDefinition | string;
    return typeof first === "string" ? first : first.id;
  }
  return "Relay";
}

export function formatPromptOutput(format: PromptFormat): string | null {
  const config = accountsConfig.loadConfig();
  const activeAccount = accountsConfig.getActiveAccount();
  if (!activeAccount) return null;

  const model = getModelForProvider(activeAccount.provider);
  const provider = activeAccount.provider;
  const account = activeAccount.name;
  const providerFilter = config.rotation.providerFilter ?? "cross-provider";
  const strategy = config.rotation.enabled
    ? `${config.rotation.strategy}:${providerFilter}`
    : "off";

  switch (format) {
    case "starship": {
      const parts = [model, provider, account];
      if (strategy !== "off") parts.push(strategy);
      return parts.join(" ");
    }
    case "zsh": {
      const dim = "%F{240}";
      const cyan = "%F{6}";
      const green = "%F{2}";
      const yellow = "%F{3}";
      const reset = "%f";
      const label = `${dim}relay${reset}`;
      const modelStr = `${cyan}${model}${reset}`;
      const providerStr = `${green}${provider}${reset}`;
      const accountStr = `${green}${account}${reset}`;
      const stratStr = strategy !== "off" ? ` ${yellow}${strategy}${reset}` : "";
      return `${label} ${modelStr} ${providerStr} ${accountStr}${stratStr}`;
    }
    case "plain": {
      const parts = ["relay:", model, provider, account];
      if (strategy !== "off") parts.push(strategy);
      return parts.join(" ");
    }
  }
}

/** Fast entry for `relay prompt` — bypasses oclif for Starship/shell prompt use. */
export function runPromptFast(argv: string[]): void {
  const output = formatPromptOutput(parsePromptFormat(argv));
  if (output) console.log(output);
}
