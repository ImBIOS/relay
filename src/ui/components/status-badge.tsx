import { Text } from "ink";
import type React from "react";

type LogLevel = "trace" | "debug" | "info" | "success" | "warning" | "error";

type LevelColor = "magenta" | "gray" | "cyan" | "green" | "yellow" | "red";

interface StatusBadgeProps {
  level: LogLevel;
  children: React.ReactNode;
  showTimestamp?: boolean;
  inline?: boolean;
}

const LEVEL_COLORS: Record<LogLevel, LevelColor> = {
  trace: "magenta",
  debug: "gray",
  info: "cyan",
  success: "green",
  warning: "yellow",
  error: "red",
};

const LEVEL_PREFIXES: Record<LogLevel, string> = {
  trace: "→",
  debug: "↪",
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✗",
};

/**
 * StatusBadge component for displaying status messages with color-coded prefixes.
 * Replaces the old logger functions (success, info, warning, error, etc.).
 */
export function StatusBadge({
  level,
  children,
  showTimestamp = false,
  inline = false,
}: StatusBadgeProps): React.ReactElement {
  const color = LEVEL_COLORS[level];
  const prefix = LEVEL_PREFIXES[level];
  const timestamp = new Date().toISOString().split("T")[1].split(".")[0];

  return (
    <Text color={color}>
      {showTimestamp && `[${timestamp}] `}
      {prefix} {children}
    </Text>
  );
}

// Convenience components for common status types
export function Success({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}): React.ReactElement {
  return (
    <StatusBadge inline={inline} level="success">
      {children}
    </StatusBadge>
  );
}

export function Info({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}): React.ReactElement {
  return (
    <StatusBadge inline={inline} level="info">
      {children}
    </StatusBadge>
  );
}

export function Warning({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}): React.ReactElement {
  return (
    <StatusBadge inline={inline} level="warning">
      {children}
    </StatusBadge>
  );
}

export function Error({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}): React.ReactElement {
  return (
    <StatusBadge inline={inline} level="error">
      {children}
    </StatusBadge>
  );
}

export function Debug({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}): React.ReactElement {
  return (
    <StatusBadge inline={inline} level="debug">
      {children}
    </StatusBadge>
  );
}

export function Trace({
  children,
  inline,
}: {
  children: React.ReactNode;
  inline?: boolean;
}): React.ReactElement {
  return (
    <StatusBadge inline={inline} level="trace">
      {children}
    </StatusBadge>
  );
}
