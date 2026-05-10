import { Command, type Interfaces } from "@oclif/core";
import { loadConfig } from "../config/accounts-config";
import {
  createStartEntry,
  writeCompletionEntry,
  type TelemetryEntry,
} from "../utils/telemetry";

export type InferredFlags<T extends typeof Command> = Interfaces.InferredFlags<
  (typeof BaseCommand)["baseFlags"] & T["flags"]
>;
export type InferredArgs<T extends typeof Command> = Interfaces.InferredArgs<T["args"]>;

/**
 * Check for MiniMax accounts without groupId and show warning (non-blocking).
 * Skipped when --silent is passed (hook context) to avoid unnecessary I/O.
 */
function checkMiniMaxGroupId(): void {
  try {
    const config = loadConfig();
    const minimaxAccounts = Object.values(config.accounts).filter(
      (a) => a.provider === "minimax" && a.isActive && !a.groupId,
    );

    if (minimaxAccounts.length > 0) {
      console.warn("\n⚠️  Warning:");
      for (const account of minimaxAccounts) {
        console.warn(
          `  MiniMax account "${account.name}" is missing groupId. Run \`relay account edit ${account.id}\` to set it.`,
        );
        console.warn("  Usage data may be incomplete.");
      }
      console.warn("");
    }
  } catch {
    // Silently ignore errors during warning check
  }
}

/**
 * Base command class for all relay CLI commands.
 * Provides telemetry, MiniMax groupId warnings, and oclif argument parsing.
 */
export abstract class BaseCommand<T extends typeof Command> extends Command {
  static enableJsonFlag = true;

  protected flags!: InferredFlags<T>;
  protected args!: InferredArgs<T>;
  private telemetryEntry: TelemetryEntry | null = null;
  private telemetryStartMs: number = 0;

  public async init(): Promise<void> {
    // Parse arguments using oclif's parser
    try {
      const { args, flags } = await this.parse({
        flags: this.ctor.flags,
        baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
        enableJsonFlag: this.ctor.enableJsonFlag,
        args: this.ctor.args,
        strict: this.ctor.strict,
      });
      this.flags = flags as InferredFlags<T>;
      this.args = args as InferredArgs<T>;
    } catch (error) {
      this.flags = {} as InferredFlags<T>;
      this.args = {} as InferredArgs<T>;

      if (this.ctor.strict === false) {
        // argv is already populated by the parent constructor
      } else {
        throw error;
      }
    }

    // Only run MiniMax groupId check for interactive (non-silent) commands
    const isSilent = this.argv.includes("--silent");
    if (!isSilent) {
      checkMiniMaxGroupId();
    }

    // Start telemetry recording
    const commandId = this.id ?? "unknown";
    this.telemetryStartMs = Date.now();
    this.telemetryEntry = createStartEntry(
      commandId,
      this.flags as Record<string, unknown>,
      this.argv.filter((a) => !a.startsWith("--")),
    );
  }

  protected async catch(err: Error & { exitCode?: number }): Promise<void> {
    this.recordTelemetry(err.exitCode ?? 1, err.message);
    throw err;
  }

  protected async finally(_: Error | undefined): Promise<void> {
    if (this.telemetryEntry && this.telemetryEntry.exit_code === null) {
      this.recordTelemetry(0);
    }
  }

  private recordTelemetry(exitCode: number, errorMessage?: string): void {
    if (!this.telemetryEntry) return;
    const durationMs = Date.now() - this.telemetryStartMs;
    writeCompletionEntry(this.telemetryEntry, durationMs, exitCode, errorMessage);
  }
}