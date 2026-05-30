import { Command, Flags } from "@oclif/core";
import * as accountsConfig from "../config/accounts-config";
import { getProviderModels, type ModelDefinition } from "../config/provider-registry";

/**
 * `relay prompt` — outputs a compact status string for shell prompts (Starship, etc.)
 *
 * Output format: MODEL_NAME PROVIDER_NAME ACCOUNT_NAME STRATEGY_NAME
 *
 * Modes:
 *   --format=starship   Output compact space-separated string (default)
 *   --format=zsh        Output raw zsh RPROMPT string with ANSI colors
 *   --format=plain      Plain text prefixed with "relay:" (for debugging)
 *
 * The command is designed to be fast (<5ms) — it only reads the config file,
 * no network calls. Starship calls it on every prompt render via `command_timeout`.
 *
 * IMPORTANT: This extends Command directly (not BaseCommand) to skip telemetry
 * and MiniMax groupId checks. Those add I/O overhead that causes Starship timeouts.
 */
export default class Prompt extends Command {
  static description = "Output active relay info for shell prompts";
  static hidden = true;
  static flags = {
    format: Flags.string({
      description: "Output format",
      options: ["starship", "zsh", "plain"],
      default: "starship",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Prompt);
    const config = accountsConfig.loadConfig();
    const activeAccount = accountsConfig.getActiveAccount();

    if (!activeAccount) {
      return;
    }

    const provider = activeAccount.provider;
    const model = this.getModelForProvider(provider);
    const account = activeAccount.name;
    const providerFilter = config.rotation.providerFilter ?? "cross-provider";
    const strategy = config.rotation.enabled
      ? `${config.rotation.strategy}:${providerFilter}`
      : "off";

    switch (flags.format) {
      case "starship":
        this.printStarship(model, provider, account, strategy);
        break;
      case "zsh":
        this.printZsh(model, provider, account, strategy);
        break;
      case "plain":
        this.printPlain(model, provider, account, strategy);
        break;
    }
  }

  private getModelForProvider(provider: string): string {
    const models = getProviderModels(provider);
    if (Array.isArray(models) && models.length > 0) {
      const first = models[0] as ModelDefinition | string;
      return typeof first === "string" ? first : first.id;
    }
    return "Relay";
  }

  private printStarship(
    model: string,
    provider: string,
    account: string,
    strategy: string,
  ): void {
    const parts = [model, provider, account];
    if (strategy !== "off") parts.push(strategy);
    console.log(parts.join(" "));
  }

  private printZsh(
    model: string,
    provider: string,
    account: string,
    strategy: string,
  ): void {
    const dim = "%F{240}";
    const cyan = "%F{6}";
    const green = "%F{2}";
    const yellow = "%F{3}";
    const reset = "%f";
    const label = `${dim}relay${reset}`;
    const modelStr = `${cyan}${model}${reset}`;
    const providerStr = `${green}${provider}${reset}`;
    const accountStr = `${green}${account}${reset}`;
    const stratStr =
      strategy !== "off" ? ` ${yellow}${strategy}${reset}` : "";
    console.log(`${label} ${modelStr} ${providerStr} ${accountStr}${stratStr}`);
  }

  private printPlain(
    model: string,
    provider: string,
    account: string,
    strategy: string,
  ): void {
    const parts = ["relay:", model, provider, account];
    if (strategy !== "off") parts.push(strategy);
    console.log(parts.join(" "));
  }
}
