import * as readline from "node:readline";
import { Args, Flags } from "@oclif/core";
import { Box, render } from "ink";
import { BaseCommand } from "../../oclif/base";
import { minimaxProvider } from "../../providers/minimax";
import { zaiProvider } from "../../providers/zai";
import { Error as ErrorBadge } from "../../ui/index";
import { spawnClaudeInstance } from "../../utils/claude-spawner";
import {
  type ClaudeResult,
  type CompareSessionRecord,
  cleanupSession,
  createIsolatedSession,
  saveCompareSession,
  setupSessionFiles,
  symlinkProjectFiles,
} from "../../utils/isolation";
import { CompareUI } from "../compare-ui";

export default class Compare extends BaseCommand<typeof Compare> {
  static description = "Side-by-side Claude comparison between providers";
  static examples = [
    '<%= config.bin %> compare "Write a React component"',
    "<%= config.bin %> compare --timeout 60",
    'echo "Write a function" | <%= config.bin %> compare',
  ];

  static args = {
    prompt: Args.string({
      description: "Prompt to compare",
      required: false,
    }),
  };

  static flags = {
    timeout: Flags.integer({
      char: "t",
      description: "Timeout per provider in seconds",
      default: 120,
    }),
    iterations: Flags.integer({
      char: "i",
      description: "Number of iterations to run",
      default: 1,
    }),
    "no-save": Flags.boolean({
      description: "Don't save results to history",
      default: false,
    }),
    simultaneous: Flags.boolean({
      description: "Run both providers at once",
      default: true,
    }),
    sequential: Flags.boolean({
      description: "Run providers one at a time",
      default: false,
    }),
  };

  static strict = false;

  async run(): Promise<void> {
    let prompt = this.args.prompt;

    // Check for stdin input
    if (!(prompt || process.stdin.isTTY)) {
      const stdinResult = await this.readStdin();
      if (stdinResult) {
        prompt = stdinResult;
      }
    }

    // Interactive mode if no prompt
    if (!prompt) {
      prompt = await this.readInteractiveInput();
      if (!prompt) {
        this.log("Cancelled.");
        return;
      }
    }

    await this.runComparison({
      prompt,
      timeout: this.flags.timeout,
      iterations: this.flags.iterations,
      save: !this.flags["no-save"],
      strategy: this.flags.sequential ? "sequential" : "simultaneous",
    });
  }

  private async readStdin(): Promise<string | null> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        return Buffer.concat(chunks).toString("utf-8").trim();
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private async readInteractiveInput(): Promise<string> {
    return new Promise((resolve) => {
      console.log("");
      console.log("Enter your prompt (Ctrl+D or Ctrl+Z to submit, Ctrl+C to cancel):");
      console.log("".padEnd(60, "─"));

      const lines: string[] = [];
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      rl.on("line", (line) => {
        lines.push(line);
      });

      rl.on("close", () => {
        const promptText = lines.join("\n").trim();
        if (promptText) {
          console.log("Prompt received. Starting comparison...");
        }
        resolve(promptText);
      });
    });
  }

  private async runComparison(options: {
    prompt: string;
    timeout: number;
    iterations: number;
    save: boolean;
    strategy: "simultaneous" | "sequential";
  }): Promise<void> {
    const { prompt, timeout, save, strategy } = options;

    const zaiConfig = zaiProvider.getConfig();
    const minimaxConfig = minimaxProvider.getConfig();

    if (!(zaiConfig.apiKey || minimaxConfig.apiKey)) {
      await this.renderApp(
        <Box>
          <ErrorBadge>No providers configured. Run 'relay config' first.</ErrorBadge>
        </Box>,
      );
      return;
    }

    // Create sessions for both providers
    const zaiSession = createIsolatedSession("zai");
    const minimaxSession = createIsolatedSession("minimax");

    // Setup sessions
    if (zaiConfig.apiKey) {
      setupSessionFiles(zaiSession, zaiConfig.apiKey, zaiConfig.baseUrl);
    }
    if (minimaxConfig.apiKey) {
      setupSessionFiles(minimaxSession, minimaxConfig.apiKey, minimaxConfig.baseUrl);
    }

    // Symlink project files
    const projectPath = process.cwd();
    symlinkProjectFiles(projectPath, zaiSession.providerPath);
    symlinkProjectFiles(projectPath, minimaxSession.providerPath);

    let zaiResult: ClaudeResult | null = null;
    let minimaxResult: ClaudeResult | null = null;

    const cleanup = () => {
      cleanupSession(zaiSession);
      cleanupSession(minimaxSession);
    };

    try {
      if (strategy === "sequential") {
        if (zaiConfig.apiKey) {
          zaiResult = await spawnClaudeInstance({
            session: zaiSession,
            prompt,
            timeoutMs: timeout * 1000,
          });
        }
        if (minimaxConfig.apiKey) {
          minimaxResult = await spawnClaudeInstance({
            session: minimaxSession,
            prompt,
            timeoutMs: timeout * 1000,
          });
        }
      } else {
        const promises: Promise<void>[] = [];

        if (zaiConfig.apiKey) {
          promises.push(
            spawnClaudeInstance({
              session: zaiSession,
              prompt,
              timeoutMs: timeout * 1000,
            }).then((result) => {
              zaiResult = result;
            }),
          );
        }

        if (minimaxConfig.apiKey) {
          promises.push(
            spawnClaudeInstance({
              session: minimaxSession,
              prompt,
              timeoutMs: timeout * 1000,
            }).then((result) => {
              minimaxResult = result;
            }),
          );
        }

        await Promise.all(promises);
      }

      // Determine winner
      let winner: "zai" | "minimax" | "tie" | undefined;
      if (zaiResult && minimaxResult) {
        if (!(zaiResult.error || minimaxResult.error)) {
          if (zaiResult.timeMs < minimaxResult.timeMs) {
            winner = "zai";
          } else if (minimaxResult.timeMs < zaiResult.timeMs) {
            winner = "minimax";
          } else {
            winner = "tie";
          }
        } else if (!zaiResult.error) {
          winner = "zai";
        } else if (!minimaxResult.error) {
          winner = "minimax";
        }
      }

      // Save session
      if (save) {
        const record: CompareSessionRecord = {
          id: zaiSession.sessionId,
          timestamp: new Date().toISOString(),
          prompt,
          zaiResult: zaiResult ?? undefined,
          minimaxResult: minimaxResult ?? undefined,
          winner: winner ?? undefined,
        };
        saveCompareSession(record);
      }

      // Render result UI
      const { waitUntilExit } = render(
        <CompareUI
          minimaxResult={minimaxResult}
          onCancel={cleanup}
          prompt={prompt}
          winner={winner ?? null}
          zaiResult={zaiResult}
        />,
      );

      await waitUntilExit();
    } finally {
      cleanup();
    }
  }
}
