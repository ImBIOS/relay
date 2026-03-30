export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "success"
  | "warning"
  | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  success: 2,
  warning: 3,
  error: 4,
};

const COLORS: Record<LogLevel | "reset", string> = {
  trace: "\x1b[35m", // Magenta
  debug: "\x1b[90m", // Gray
  info: "\x1b[36m", // Cyan
  success: "\x1b[32m", // Green
  warning: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  reset: "\x1b[0m",
};

const LEVEL_PREFIXES: Record<LogLevel, string> = {
  trace: "→",
  debug: "↪",
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✗",
};

function getMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (
    env === "trace" ||
    env === "debug" ||
    env === "info" ||
    env === "warning" ||
    env === "error"
  ) {
    return env as LogLevel;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[getMinLevel()];
}

export function log(message: string, level: LogLevel = "info"): void {
  if (!shouldLog(level)) {
    return;
  }
  const color = COLORS[level];
  const prefix = LEVEL_PREFIXES[level];
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`${color}[${timestamp}] ${prefix} ${message}${COLORS.reset}`);
}

export function success(message: string): void {
  log(message, "success");
}

export function info(message: string): void {
  log(message, "info");
}

export function warning(message: string): void {
  log(message, "warning");
}

export function error(message: string): void {
  log(message, "error");
}

export function trace(message: string): void {
  log(message, "trace");
}

export function debug(message: string): void {
  log(message, "debug");
}

export function table(data: Record<string, string | number>): void {
  const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));
  const maxValLength = Math.max(
    ...Object.values(data).map((v) => String(v).length)
  );

  for (const [key, value] of Object.entries(data)) {
    const paddedKey = key.padEnd(maxKeyLength);
    const paddedVal = String(value).padStart(maxValLength);
    console.log(`  ${paddedKey}  →  ${paddedVal}`);
  }
}

export function section(title: string): void {
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(50));
}

export function divider(): void {
  console.log("");
}
