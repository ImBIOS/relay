import { Command, Flags } from "@oclif/core";
import { formatPromptOutput, type PromptFormat } from "../prompt-fast";

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
    const output = formatPromptOutput(flags.format as PromptFormat);
    if (output) console.log(output);
  }
}
