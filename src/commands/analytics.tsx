import { Flags } from "@oclif/core";
import { Box, Text } from "ink";
import type React from "react";
import { BaseCommand } from "../oclif/base";
import {
  buildAnalytics,
  getTelemetryFilePath,
  type AnalyticsSummary,
  type CommandStats,
} from "../utils/telemetry";
import { Info, Section, Table, Warning } from "../ui/index";

export default class Analytics extends BaseCommand<typeof Analytics> {
  static description =
    "Show command usage analytics — most used, rarely used, and never used features";
  static examples = [
    "<%= config.bin %> analytics",
    "<%= config.bin %> analytics --json",
    "<%= config.bin %> analytics --top 20",
    "<%= config.bin %> analytics --include-never-used",
  ];

  static flags = {
    json: Flags.boolean({
      description: "Output analytics as JSON",
      default: false,
    }),
    top: Flags.integer({
      description: "Number of top commands to show (default: 10)",
      default: 10,
    }),
    "include-never-used": Flags.boolean({
      description: "Include never-used commands in the output",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Analytics);
    const analytics = buildAnalytics();

    if (flags.json) {
      console.log(JSON.stringify(analytics, null, 2));
      return;
    }

    await this.renderApp(
      <AnalyticsUI
        analytics={analytics}
        topN={flags.top}
        showNeverUsed={flags["include-never-used"]}
      />,
      { autoExit: true },
    );
  }
}

// ─── UI Components ─────────────────────────────────────────────────────

interface AnalyticsUIProps {
  analytics: AnalyticsSummary;
  topN: number;
  showNeverUsed: boolean;
}

function AnalyticsUI({ analytics, topN, showNeverUsed }: AnalyticsUIProps): React.ReactElement {
  const { totalEntries, uniqueCommands, commandStats, neverUsedCommands, dateRange } = analytics;

  if (totalEntries === 0) {
    return (
      <Section title="Relay Analytics">
        <Warning>No telemetry data found.</Warning>
        <Box marginTop={1}>
          <Info>Telemetry is automatically collected when you run relay commands.</Info>
        </Box>
        <Box>
          <Info>Log file: {getTelemetryFilePath()}</Info>
        </Box>
        <Box>
          <Info>Run a few commands and check back here.</Info>
        </Box>
      </Section>
    );
  }

  // Classify commands
  const topCommands = commandStats.slice(0, topN);
  const rarelyUsed = commandStats.filter((c) => c.invocations <= 3 && !topCommands.includes(c));
  const neverUsed = showNeverUsed ? neverUsedCommands : [];

  return (
    <Section title="Relay Analytics">
      {/* Overview */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Overview</Text>
        <Table
          data={{
            "Total Invocations": String(totalEntries),
            "Unique Commands": `${uniqueCommands} / ${analytics.allKnownCommands.length}`,
            "Date Range": dateRange.earliest
              ? `${formatDate(dateRange.earliest)} → ${formatDate(dateRange.latest ?? "")}`
              : "N/A",
            "Log File": getTelemetryFilePath(),
          }}
        />
      </Box>

      {/* Most Used */}
      {topCommands.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Most Used Commands (top {topN})</Text>
          {topCommands.map((cmd) => (
            <CommandRow key={cmd.command} stats={cmd} />
          ))}
        </Box>
      )}

      {/* Rarely Used */}
      {rarelyUsed.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Rarely Used Commands (≤3 invocations)</Text>
          {rarelyUsed.map((cmd) => (
            <CommandRow key={cmd.command} stats={cmd} />
          ))}
        </Box>
      )}

      {/* Never Used */}
      {neverUsed.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>Never Used Commands ({neverUsed.length})</Text>
          <Box flexDirection="column" paddingLeft={2}>
            {neverUsed.map((cmd) => (
              <Box key={cmd}>
                <Text color="gray"> {cmd}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Info>
          {neverUsedCommands.length > 0 && !showNeverUsed
            ? `+${neverUsedCommands.length} more never-used commands. Use --include-never-used to see all.`
            : "Use --json for machine-readable output."}
        </Info>
      </Box>
    </Section>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

function CommandRow({ stats }: { stats: CommandStats }): React.ReactElement {
  const bar = buildBar(stats.invocations);
  const successRate =
    stats.invocations > 0 ? ((stats.successes / stats.invocations) * 100).toFixed(0) : "—";

  return (
    <Box paddingLeft={2}>
      <Box width="40%">
        <Text>{stats.command}</Text>
      </Box>
      <Box width="25%">
        <Text color="cyan">{bar}</Text>
      </Box>
      <Box width="15%">
        <Text>{stats.invocations}x</Text>
      </Box>
      <Box width="10%">
        <Text color={stats.failures > 0 ? "red" : "green"}>{successRate}%</Text>
      </Box>
      <Box width="10%">
        <Text color="gray">{formatDuration(stats.avgDurationMs)}</Text>
      </Box>
    </Box>
  );
}

function buildBar(count: number, maxLen = 15): string {
  if (count === 0) return "";
  // Log scale: 1 → 1, 10 → 8, 100 → 15
  const len = Math.min(maxLen, Math.max(1, Math.ceil(Math.log10(count + 1) * 5)));
  return "█".repeat(len) + "░".repeat(maxLen - len);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
