import * as accountsConfig from "../config/accounts-config";
import { loadSettings } from "../config/settings";
import { BaseCommand } from "../oclif/base";
import { Flags } from "@oclif/core";

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
 */
export default class Prompt extends BaseCommand<typeof Prompt> {
  static description = "Output active relay info for shell prompts";
  static hidden = true; // Internal, not shown in help
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

    // Try legacy config format (provider + api key at top level) if v2 has no accounts
    if (!activeAccount) {
      const settings = loadSettings();
      const provider = settings.provider ?? "unknown";
      const model = this.getModelForProvider(settings, provider);
      const account = this.getAccountLabelForLegacy(settings, provider);
      const strategy = config.rotation?.enabled
        ? ((config.rotation?.strategy as string) ?? "off")
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
      return;
    }

    // V2 account format
    const provider = activeAccount.provider;
    const settings = loadSettings();
    const model = this.getModelForProvider(settings, provider);
    const account = activeAccount.name.split("@")[0] ?? activeAccount.name;
    const strategy = config.rotation.enabled ? config.rotation.strategy : "off";

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

  /**
   * Get the first model name for a given provider from settings.
   * Falls back to "Relay" if no models configured.
   */
  private getModelForProvider(
    settings: Record<string, unknown>,
    provider: string,
  ): string {
    const providerConfig = settings[provider];
    if (
      providerConfig &&
      typeof providerConfig === "object" &&
      providerConfig !== null
    ) {
      const models = (providerConfig as Record<string, unknown>).models;
      if (Array.isArray(models) && models.length > 0 && typeof models[0] === "string") {
        return models[0];
      }
    }
    return "Relay";
  }

  /**
   * Get a short account label from legacy config.
   * Uses the API key prefix (e.g., "7097...") as identifier.
   */
  private getAccountLabelForLegacy(
    settings: Record<string, unknown>,
    provider: string,
  ): string {
    const providerConfig = settings[provider];
    if (
      providerConfig &&
      typeof providerConfig === "object" &&
      providerConfig !== null
    ) {
      const apiKey = (providerConfig as Record<string, unknown>).apiKey;
      if (typeof apiKey === "string" && apiKey.length > 8) {
        return `${apiKey.slice(0, 4)}..${apiKey.slice(-4)}`;
      }
    }
    return provider;
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
    const parts = [`relay:`, model, provider, account];
    if (strategy !== "off") parts.push(strategy);
    console.log(parts.join(" "));
  }
}
