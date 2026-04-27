/**
 * Relay Command Telemetry
 *
 * Lightweight, append-only JSONL telemetry that records every CLI command
 * invocation to ~/.claude/relay-telemetry.log. Used by `relay analytics`
 * to show feature usage patterns (most used, rarely used, never used).
 *
 * Design decisions:
 * - File-based (no DB dependency, works offline, easy to inspect with jq/grep)
 * - Append-only JSONL (one JSON object per line, crash-safe)
 * - Silent by default (no stdout noise, respects LOG_LEVEL)
 * - Auto-rotates when file exceeds 10MB (keeps last 2 files)
 * - Opt-out via RELAY_DISABLE_TELEMETRY=1
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Config ────────────────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), ".claude");
const TELEMETRY_FILE = join(CONFIG_DIR, "relay-telemetry.log");
const TELEMETRY_FILE_OLD = join(CONFIG_DIR, "relay-telemetry.log.1");
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Types ─────────────────────────────────────────────────────────────

export interface TelemetryEntry {
  ts: string; // ISO 8601 timestamp
  command: string; // Full command path, e.g. "proxy start", "hooks install"
  flags: Record<string, unknown>; // Parsed flags (excluding sensitive values)
  args: string[]; // Positional arguments
  duration_ms: number | null; // Execution time (null if not yet finished)
  exit_code: number | null; // Process exit code (null if not yet finished)
  error?: string; // Error message if command failed
  version?: string; // Relay version (if available)
}

// ─── Sensitive flag keys to redact ─────────────────────────────────────

const SENSITIVE_FLAG_KEYS = new Set([
  "api-key",
  "apiKey",
  "api_key",
  "zai-api-key",
  "minimax-api-key",
  "token",
  "password",
  "secret",
]);

function redactFlags(flags: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flags)) {
    if (SENSITIVE_FLAG_KEYS.has(key)) {
      redacted[key] = "***REDACTED***";
    } else if (typeof value === "string" && value.length > 100) {
      // Truncate long string values to keep log entries reasonable
      redacted[key] = value.slice(0, 100) + "...";
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

// ─── Rotation ──────────────────────────────────────────────────────────

function rotateIfNeeded(): void {
  try {
    if (!existsSync(TELEMETRY_FILE)) return;
    const stat = statSync(TELEMETRY_FILE);
    if (stat.size < MAX_FILE_SIZE_BYTES) return;

    // Delete old backup if it exists, then rotate
    try {
      renameSync(TELEMETRY_FILE_OLD, TELEMETRY_FILE_OLD + ".bak");
    } catch {}
    renameSync(TELEMETRY_FILE, TELEMETRY_FILE_OLD);
    try {
      renameSync(TELEMETRY_FILE_OLD + ".bak", TELEMETRY_FILE_OLD);
    } catch {}
  } catch {
    // Rotation failure is non-critical
  }
}

// ─── Core ──────────────────────────────────────────────────────────────

function isTelemetryDisabled(): boolean {
  return process.env.RELAY_DISABLE_TELEMETRY === "1";
}

/**
 * Write a telemetry entry to the log file.
 * Called at command start (with duration_ms=null) and again at command end.
 */
export function writeTelemetryEntry(entry: TelemetryEntry): void {
  if (isTelemetryDisabled()) return;

  try {
    // Ensure config dir exists
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }

    rotateIfNeeded();

    const line = JSON.stringify(entry) + "\n";
    appendFileSync(TELEMETRY_FILE, line, "utf-8");
  } catch {
    // Telemetry must never crash the CLI
  }
}

/**
 * Create a telemetry entry for a command invocation.
 * Call this at command start — duration_ms and exit_code will be null.
 */
export function createStartEntry(
  command: string,
  flags: Record<string, unknown>,
  args: string[],
): TelemetryEntry {
  return {
    ts: new Date().toISOString(),
    command,
    flags: redactFlags(flags),
    args,
    duration_ms: null,
    exit_code: null,
  };
}

/**
 * Update a start entry with completion data and write it.
 */
export function writeCompletionEntry(
  startEntry: TelemetryEntry,
  durationMs: number,
  exitCode: number,
  error?: string,
): void {
  const completion: TelemetryEntry = {
    ...startEntry,
    duration_ms: durationMs,
    exit_code: exitCode,
    ...(error ? { error } : {}),
  };
  writeTelemetryEntry(completion);
}

// ─── Analytics helpers ─────────────────────────────────────────────────

export interface CommandStats {
  command: string;
  invocations: number;
  successes: number;
  failures: number;
  avgDurationMs: number;
  lastUsed: string | null;
  firstUsed: string | null;
}

export interface AnalyticsSummary {
  totalEntries: number;
  uniqueCommands: number;
  commandStats: CommandStats[];
  allKnownCommands: string[];
  neverUsedCommands: string[];
  dateRange: { earliest: string | null; latest: string | null };
}

/**
 * Read and parse the telemetry log file.
 */
export function readTelemetryLog(): TelemetryEntry[] {
  if (!existsSync(TELEMETRY_FILE)) return [];

  try {
    const content = require("node:fs").readFileSync(TELEMETRY_FILE, "utf-8");
    return content
      .split("\n")
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => JSON.parse(line) as TelemetryEntry);
  } catch {
    return [];
  }
}

/**
 * Get the path to the telemetry log file (for display purposes).
 */
export function getTelemetryFilePath(): string {
  return TELEMETRY_FILE;
}

/**
 * Get all registered relay commands by scanning the commands directory structure.
 * Returns flat command names like "proxy start", "hooks install", "account add".
 */
export function getAllKnownCommands(): string[] {
  const commands: string[] = [];

  const commandGroups: Record<string, string[]> = {
    "": [
      "analytics",
      "claude",
      "completion",
      "config",
      "cost",
      "dashboard",
      "doctor",
      "env",
      "first-run",
      "help",
      "history",
      "init",
      "opencode",
      "plugin",
      "rotate",
      "status",
      "switch",
      "test",
      "usage",
      "version",
    ],
    account: ["add", "edit", "list", "remove", "switch"],
    alert: ["add", "disable", "enable", "list"],
    auto: ["disable", "enable", "rotate", "status"],
    dashboard: ["start", "status", "stop"],
    hooks: [
      "forge-setup",
      "forge-stop",
      "index",
      "install",
      "post-tool",
      "session-start",
      "status",
      "stop",
      "uninstall",
    ],
    mcp: ["add", "add-predefined", "disable", "enable", "export", "list", "remove", "test"],
    plugins: ["index", "install", "status", "templates", "uninstall"],
    profile: ["create", "delete", "export", "list", "switch"],
    project: ["doctor", "init"],
    proxy: ["start", "status", "stop"],
  };

  // Single-word commands (no group prefix)
  for (const cmd of commandGroups[""] ?? []) {
    commands.push(cmd);
  }

  // Grouped commands
  for (const [group, subcommands] of Object.entries(commandGroups)) {
    if (group === "") continue;
    for (const sub of subcommands) {
      commands.push(`${group} ${sub}`);
    }
  }

  return commands;
}

/**
 * Build analytics summary from telemetry log data.
 */
export function buildAnalytics(): AnalyticsSummary {
  const entries = readTelemetryLog();

  // Only consider completion entries (those with duration_ms set)
  const completed = entries.filter((e) => e.duration_ms !== null);

  // Group by command
  const commandMap = new Map<
    string,
    {
      invocations: number;
      successes: number;
      failures: number;
      totalDuration: number;
      lastUsed: string | null;
      firstUsed: string | null;
    }
  >();

  for (const entry of completed) {
    const existing = commandMap.get(entry.command) ?? {
      invocations: 0,
      successes: 0,
      failures: 0,
      totalDuration: 0,
      lastUsed: null,
      firstUsed: null,
    };

    existing.invocations++;
    if (entry.exit_code === 0) {
      existing.successes++;
    } else {
      existing.failures++;
    }
    existing.totalDuration += entry.duration_ms ?? 0;

    if (!existing.firstUsed || entry.ts < existing.firstUsed) {
      existing.firstUsed = entry.ts;
    }
    if (!existing.lastUsed || entry.ts > existing.lastUsed) {
      existing.lastUsed = entry.ts;
    }

    commandMap.set(entry.command, existing);
  }

  // Build sorted stats
  const commandStats: CommandStats[] = [...commandMap.entries()]
    .map(([command, data]) => ({
      command,
      invocations: data.invocations,
      successes: data.successes,
      failures: data.failures,
      avgDurationMs: data.invocations > 0 ? Math.round(data.totalDuration / data.invocations) : 0,
      lastUsed: data.lastUsed,
      firstUsed: data.firstUsed,
    }))
    .sort((a, b) => b.invocations - a.invocations);

  // Determine never-used commands
  const allKnown = getAllKnownCommands();
  const usedCommands = new Set(commandMap.keys());
  const neverUsed = allKnown.filter((cmd) => !usedCommands.has(cmd));

  // Date range
  const allTimestamps = completed.map((e) => e.ts).sort();
  const earliest = allTimestamps[0] ?? null;
  const latest = allTimestamps[allTimestamps.length - 1] ?? null;

  return {
    totalEntries: completed.length,
    uniqueCommands: commandMap.size,
    commandStats,
    allKnownCommands: allKnown,
    neverUsedCommands: neverUsed,
    dateRange: { earliest, latest },
  };
}
