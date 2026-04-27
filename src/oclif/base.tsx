import { Command, type Interfaces } from "@oclif/core";
import { type Instance, type RenderOptions, render } from "ink";
import type React from "react";
import { loadConfig } from "../config/accounts-config";
import { createStartEntry, writeCompletionEntry, type TelemetryEntry } from "../utils/telemetry";

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
      // Use console.warn for non-blocking warning
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
 * Base command class that integrates oclif with ink for React-based CLI UI.
 * All commands should extend this class.
 */
export abstract class BaseCommand<T extends typeof Command> extends Command {
  static enableJsonFlag = true;

  protected flags!: InferredFlags<T>;
  protected args!: InferredArgs<T>;
  private inkInstance: Instance | null = null;
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
      // If parsing fails, set defaults
      this.flags = {} as InferredFlags<T>;
      this.args = {} as InferredArgs<T>;

      // For non-strict commands (like claude), populate argv
      if (this.ctor.strict === false) {
        // argv is already populated by the parent constructor
      } else {
        throw error;
      }
    }

    // Only run MiniMax groupId check for interactive (non-silent) commands
    // This avoids unnecessary config I/O in hook context
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

  /**
   * Render an ink React component and wait for it to exit.
   * Use this for interactive UI components.
   * @param autoExit - If true, automatically exit after rendering (default: true for non-TTY)
   */
  protected async renderApp(
    element: React.ReactElement,
    options?: RenderOptions & { autoExit?: boolean },
  ): Promise<void> {
    const { autoExit, ...renderOptions } = options || {};
    this.inkInstance = render(element, renderOptions);

    // Auto-exit for non-interactive contexts or when explicitly requested
    const shouldAutoExit = autoExit ?? !process.stdout.isTTY;
    if (shouldAutoExit) {
      // Give ink time to render, then exit
      setTimeout(() => {
        if (this.inkInstance) {
          this.inkInstance.unmount();
        }
      }, 150);
    }

    await this.inkInstance.waitUntilExit();
  }

  /**
   * Render an ink React component without waiting for exit.
   * Use this for static output that doesn't need user interaction.
   */
  protected renderStatic(element: React.ReactElement, options?: RenderOptions): Instance {
    this.inkInstance = render(element, options);
    return this.inkInstance;
  }

  /**
   * Unmount the current ink instance if one exists.
   */
  protected unmount(): void {
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = null;
    }
  }

  /**
   * Rerender the current ink instance with a new element.
   */
  protected rerender(element: React.ReactElement): void {
    if (this.inkInstance) {
      this.inkInstance.rerender(element);
    }
  }

  protected async catch(err: Error & { exitCode?: number }): Promise<void> {
    this.recordTelemetry(err.exitCode ?? 1, err.message);
    this.unmount();
    throw err;
  }

  protected async finally(_: Error | undefined): Promise<void> {
    // Record successful completion (only if catch didn't already record)
    if (this.telemetryEntry && this.telemetryEntry.exit_code === null) {
      this.recordTelemetry(0);
    }
  }

  /**
   * Write telemetry entry with completion data.
   * Called from catch (on error) or finally (on success).
   */
  private recordTelemetry(exitCode: number, errorMessage?: string): void {
    if (!this.telemetryEntry) return;
    const durationMs = Date.now() - this.telemetryStartMs;
    writeCompletionEntry(this.telemetryEntry, durationMs, exitCode, errorMessage);
  }
}
