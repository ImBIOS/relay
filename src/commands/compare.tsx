import * as readline from "node:readline";
import { render } from "ink";
import { useState } from "react";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import { spawnClaudeInstance } from "../utils/claude-spawner";
import {
  type ClaudeResult,
  type CompareSessionRecord,
  cleanupSession,
  createIsolatedSession,
  getCompareSession,
  loadCompareHistory,
  saveCompareSession,
  setupSessionFiles,
  symlinkProjectFiles,
} from "../utils/isolation";
import { error, info, section, success } from "../utils/logger";
import { CompareUI, HistoryList, SessionDetail } from "./compare-ui";

interface CompareArgs {
  prompt?: string;
  timeout?: number;
  iterations?: number;
  noSave?: boolean;
  save?: boolean;
  strategy?: "simultaneous" | "sequential";
}

async function readInteractiveInput(): Promise<string> {
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
      const prompt = lines.join("\n").trim();
      if (prompt) {
        success("Prompt received. Starting comparison...");
      }
      resolve(prompt);
    });

    // Handle Ctrl+C
    process.stdin.on("data", (data) => {
      if (data.toString() === "\x03") {
        rl.close();
        resolve("");
      }
    });
  });
}

export async function handleCompare(args: string[]): Promise<void> {
  const action = args[0] as string | undefined;

  // Handle history subcommands
  if (action === "history" || action === "list") {
    await showHistoryList();
    return;
  }

  if (action === "view") {
    await viewSession(args[1]);
    return;
  }

  if (action === "diff") {
    await diffSessions(args[1], args[2]);
    return;
  }

  // Parse arguments for compare mode
  const parsedArgs = parseCompareArgs(args);

  // Check if we have stdin input
  if (!parsedArgs.prompt) {
    const stdinInput = await readStdin();
    if (stdinInput) {
      parsedArgs.prompt = stdinInput;
    }
  }

  // If no prompt provided, start interactive mode
  if (!parsedArgs.prompt) {
    console.log("");
    const interactivePrompt = await readInteractiveInput();
    if (!interactivePrompt) {
      info("Cancelled.");
      return;
    }
    parsedArgs.prompt = interactivePrompt;
  }

  // Run comparison
  await runComparison({
    prompt: parsedArgs.prompt,
    timeout: parsedArgs.timeout,
    iterations: parsedArgs.iterations,
    save: !parsedArgs.noSave,
    strategy: parsedArgs.strategy,
  });
}

function parseCompareArgs(args: string[]): CompareArgs {
  const result: CompareArgs = {
    prompt: undefined,
    timeout: 120,
    iterations: 1,
    save: true,
    strategy: "simultaneous",
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--timeout" || arg === "-t") {
      result.timeout = Number.parseInt(args[i + 1], 10) || 120;
      i += 2;
    } else if (arg === "--iterations" || arg === "-i") {
      result.iterations = Number.parseInt(args[i + 1], 10) || 1;
      i += 2;
    } else if (arg === "--no-save") {
      result.save = false;
      i += 1;
    } else if (arg === "--simultaneous") {
      result.strategy = "simultaneous";
      i += 1;
    } else if (arg === "--sequential") {
      result.strategy = "sequential";
      i += 1;
    } else if (arg.startsWith("-")) {
      i += 1;
    } else {
      result.prompt = args.slice(i).join(" ");
      break;
    }
  }

  return result;
}

async function readStdin(): Promise<string | null> {
  try {
    const { readFileSync } = await import("node:fs");
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        return Buffer.concat(chunks).toString("utf-8").trim();
      }
    }
  } catch {
    // Ignore
  }
  return null;
}

function _showUsage(): void {
  console.log(`
ImBIOS Provider Comparison accountsConfig.0

Usage: relay compare <prompt> [options]
       echo "<prompt>" | relay compare
       relay compare (interactive multi-line mode)

Options:
  --timeout, -t <seconds>  Timeout per provider (default: 120)
  --iterations, -i <n>    Run multiple iterations (default: 1)
  --no-save               Don't save results to history
  --simultaneous          Run both providers at once (default)
  --sequential            Run providers one at a time

Examples:
  relay compare "Write a React component"
  relay compare "Debug this code" --timeout 60
  echo "Write a function" | relay compare
  relay compare (starts interactive mode)

History Commands:
  relay compare history     List past comparisons
  relay compare view <id>   View a specific session
  relay compare diff <id1> <id2>  Compare two sessions
`);
}

async function runComparison(options: {
  prompt: string;
  timeout?: number;
  iterations?: number;
  save?: boolean;
  strategy?: "simultaneous" | "sequential";
}): Promise<void> {
  const { prompt, timeout = 120, iterations = 1, save = true, strategy } = options;

  // Get provider configs
  const zaiConfig = zaiProvider.getConfig();
  const minimaxConfig = minimaxProvider.getConfig();

  if (!(zaiConfig.apiKey || minimaxConfig.apiKey)) {
    error("No providers configured. Run 'relay config' first.");
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

  // State for UI
  const [zaiResult, setZaiResult] = useState<ClaudeResult | null>(null);
  const [minimaxResult, setMiniMaxResult] = useState<ClaudeResult | null>(null);
  const [_isComplete, setIsComplete] = useState(false);

  // Cleanup on exit
  const cleanup = () => {
    cleanupSession(zaiSession);
    cleanupSession(minimaxSession);
  };

  // Run comparison
  try {
    if (strategy === "sequential") {
      // Sequential execution
      if (zaiConfig.apiKey) {
        const result = await spawnClaudeInstance({
          session: zaiSession,
          prompt,
          timeoutMs: timeout * 1000,
        });
        setZaiResult(result);
      }
      if (minimaxConfig.apiKey) {
        const result = await spawnClaudeInstance({
          session: minimaxSession,
          prompt,
          timeoutMs: timeout * 1000,
        });
        setMiniMaxResult(result);
      }
    } else {
      // Simultaneous execution
      const promises: Promise<void>[] = [];

      if (zaiConfig.apiKey) {
        promises.push(
          spawnClaudeInstance({
            session: zaiSession,
            prompt,
            timeoutMs: timeout * 1000,
          }).then((result) => {
            setZaiResult(result);
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
            setMiniMaxResult(result);
          }),
        );
      }

      await Promise.all(promises);
    }

    setIsComplete(true);

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

async function showHistoryList(): Promise<void> {
  const history = loadCompareHistory();

  if (history.length === 0) {
    section("Comparison History");
    info("No comparison sessions found.");
    return;
  }

  const sessions = history.map((s) => ({
    id: s.id,
    timestamp: new Date(s.timestamp).toLocaleString(),
    prompt: s.prompt,
    winner: s.winner,
  }));

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);

  if (viewSessionId) {
    const session = getCompareSession(viewSessionId);
    if (session) {
      const { waitUntilExit } = render(
        <SessionDetail
          onBack={() => setViewSessionId(null)}
          session={{
            ...session,
            timestamp: new Date(session.timestamp).toLocaleString(),
          }}
        />,
      );
      await waitUntilExit();
      setViewSessionId(null);
    }
  } else {
    const { waitUntilExit } = render(
      <HistoryList
        onSelect={setSelectedIndex}
        onView={setViewSessionId}
        selectedIndex={selectedIndex}
        sessions={sessions}
      />,
    );
    await waitUntilExit();
  }
}

async function viewSession(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    error("Usage: relay compare view <session-id>");
    return;
  }

  const session = getCompareSession(sessionId);

  if (!session) {
    error(`Session not found: ${sessionId}`);
    info("Use 'relay compare history' to list sessions.");
    return;
  }

  const { waitUntilExit } = render(
    <SessionDetail
      onBack={() => {
        // Exit will happen when component unmounts
      }}
      session={{
        ...session,
        timestamp: new Date(session.timestamp).toLocaleString(),
      }}
    />,
  );

  await waitUntilExit();
}

async function diffSessions(id1: string | undefined, id2: string | undefined): Promise<void> {
  if (!(id1 && id2)) {
    error("Usage: relay compare diff <session-id-1> <session-id-2>");
    return;
  }

  const session1 = getCompareSession(id1);
  const session2 = getCompareSession(id2);

  if (!(session1 && session2)) {
    error("One or both sessions not found.");
    return;
  }

  section("Session Comparison");

  console.log(`\nSession 1: ${id1}`);
  console.log(`Session 2: ${id2}\n`);

  // Compare timing
  if (session1.zaiResult && session2.zaiResult) {
    const diff = session1.zaiResult.timeMs - session2.zaiResult.timeMs;
    console.log(`Z.AI Time Diff: ${diff > 0 ? "+" : ""}${(diff / 1000).toFixed(2)}s`);
  }

  if (session1.minimaxResult && session2.minimaxResult) {
    const diff = session1.minimaxResult.timeMs - session2.minimaxResult.timeMs;
    console.log(`MiniMax Time Diff: ${diff > 0 ? "+" : ""}${(diff / 1000).toFixed(2)}s`);
  }

  // Compare winners
  console.log(`\nWinner 1: ${session1.winner || "N/A"}`);
  console.log(`Winner 2: ${session2.winner || "N/A"}`);
}
