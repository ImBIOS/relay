import { spawn } from "node:child_process";
import * as path from "node:path";
import type { ClaudeResult, IsolatedSession } from "./isolation";

export interface SpawnOptions {
  session: IsolatedSession;
  prompt: string;
  timeoutMs?: number;
  onOutput?: (chunk: string) => void;
}

export async function spawnClaudeInstance(options: SpawnOptions): Promise<ClaudeResult> {
  const { session, prompt, timeoutMs = 120_000, onOutput } = options;

  const startTime = Date.now();

  // Find Claude CLI
  const claudeCli = await findClaudeCli();

  if (!claudeCli) {
    return {
      provider: session.provider,
      output: "",
      timeMs: Date.now() - startTime,
      error: "Claude CLI not found. Please install Claude Code.",
    };
  }

  // Create a prompt file
  const promptPath = path.join(session.providerPath, ".prompt.txt");
  require("node:fs").writeFileSync(promptPath, prompt);

  return new Promise((resolve) => {
    // Use -p flag for programmatic execution per official docs
    const child = spawn(
      claudeCli,
      [
        "-p",
        "--output-format",
        "text",
        "--continue",
        "--no-color",
        "--model",
        session.provider === "zai" ? "GLM-5" : "MiniMax-M2.5",
      ],
      {
        cwd: session.providerPath,
        env: {
          ...process.env,
          ANTHROPIC_AUTH_TOKEN: undefined,
          ANTHROPIC_BASE_URL: undefined,
          ANTHROPIC_MODEL: undefined,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    // Send prompt to Claude via stdin (per official docs)
    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      onOutput?.(chunk);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      onOutput?.(chunk);
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        provider: session.provider,
        output: stdout,
        timeMs: Date.now() - startTime,
        error: "Timeout: Claude did not respond within timeout period",
      });
    }, timeoutMs);

    child.on("close", (code: number) => {
      clearTimeout(timeout);
      const timeMs = Date.now() - startTime;

      if (code === 0) {
        resolve({
          provider: session.provider,
          output: stdout,
          timeMs,
        });
      } else {
        resolve({
          provider: session.provider,
          output: stdout,
          timeMs,
          error: `Claude exited with code ${code}${stderr ? `: ${stderr}` : ""}`,
        });
      }
    });

    child.on("error", (err: Error) => {
      clearTimeout(timeout);
      resolve({
        provider: session.provider,
        output: stdout,
        timeMs: Date.now() - startTime,
        error: `Failed to spawn Claude: ${err.message}`,
      });
    });
  });
}

async function findClaudeCli(): Promise<string | null> {
  // Check common locations
  const possiblePaths = [
    "claude",
    "/usr/local/bin/claude",
    "/usr/bin/claude",
    `${process.env.HOME}/.npm-global/bin/claude`,
    `${process.env.HOME}/.bun/bin/claude`,
    `${process.env.HOME}/.nvm/versions/node/*/bin/claude`,
  ];

  for (const p of possiblePaths) {
    try {
      const { which } = await import("bun");
      const resolved = await which(p);
      if (resolved && (await isExecutable(resolved))) {
        return resolved;
      }
    } catch {
      // Try next
    }
  }

  // Try using which command
  try {
    const { execSync } = await import("node:child_process");
    const result = execSync("which claude 2>/dev/null || echo ''", {
      encoding: "utf-8",
    }).trim();
    if (result && (await isExecutable(result))) {
      return result;
    }
  } catch {
    // Ignore
  }

  return null;
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    const fs = await import("node:fs");
    const stat = fs.statSync(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function runClaudeInteractive(
  session: IsolatedSession,
  prompt: string,
): Promise<string> {
  const result = await spawnClaudeInstance({
    session,
    prompt,
    timeoutMs: 180_000,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  return result.output;
}
