import { Box, Text } from "ink";
import type React from "react";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import { Info, Section } from "../ui/index";

const _PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class History extends BaseCommand<typeof History> {
  static description = "Show usage history";
  static examples = ["<%= config.bin %> history"];

  async run(): Promise<void> {
    const activeProvider = settings.getActiveProvider();
    const history = settings.getUsageHistory(activeProvider);

    await this.renderApp(
      <HistoryUI history={history} provider={activeProvider} />
    );
  }
}

interface UsageRecord {
  date: string;
  used: number;
  limit: number;
}

interface HistoryUIProps {
  provider: string;
  history: UsageRecord[];
}

function HistoryUI({ provider, history }: HistoryUIProps): React.ReactElement {
  if (history.length === 0) {
    return (
      <Section title="Usage History">
        <Info>No usage history available.</Info>
      </Section>
    );
  }

  return (
    <Section title="Usage History">
      <Box flexDirection="column">
        <Text>
          {provider.toUpperCase()} Usage (Last {history.length} days):
        </Text>
        <Box marginTop={1} />
        {history.map((record) => {
          const percent =
            record.limit > 0 ? (record.used / record.limit) * 100 : 0;
          const filledBars = Math.ceil(percent / 5);
          const emptyBars = 20 - filledBars;
          const bar = "█".repeat(filledBars) + "░".repeat(emptyBars);

          return (
            <Box key={record.date}>
              <Text> {record.date} │ </Text>
              <Text color="cyan">{bar}</Text>
              <Text> │ {percent.toFixed(1)}%</Text>
            </Box>
          );
        })}
      </Box>
    </Section>
  );
}
