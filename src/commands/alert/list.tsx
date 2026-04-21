import { Box, Text } from "ink";
import type React from "react";
import { loadConfig } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Info, Section } from "../../ui/index";

export default class AlertList extends BaseCommand<typeof AlertList> {
  static description = "List all alerts";
  static examples = ["<%= config.bin %> alert list"];

  async run(): Promise<void> {
    const config = loadConfig();
    await this.renderApp(<AlertListUI alerts={config.alerts} />);
  }
}

interface AlertData {
  id: string;
  type: string;
  threshold: number;
  enabled: boolean;
}

interface AlertListUIProps {
  alerts: AlertData[];
}

function AlertListUI({ alerts }: AlertListUIProps): React.ReactElement {
  if (alerts.length === 0) {
    return (
      <Section title="Usage Alerts">
        <Info>No alerts configured. Use 'relay alert add' to add one.</Info>
      </Section>
    );
  }

  return (
    <Section title="Usage Alerts">
      <Box flexDirection="column">
        {alerts.map((alert) => (
          <Box key={alert.id}>
            <Text color={alert.enabled ? "green" : "gray"}>
              {alert.id}: {alert.type} @ {alert.threshold}% [
              {alert.enabled ? "enabled" : "disabled"}]
            </Text>
          </Box>
        ))}
      </Box>
    </Section>
  );
}
