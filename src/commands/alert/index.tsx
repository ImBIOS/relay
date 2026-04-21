import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";

export default class Alert extends BaseCommand<typeof Alert> {
  static description = "Alert configuration";
  static examples = [
    "<%= config.bin %> alert list",
    "<%= config.bin %> alert add",
    "<%= config.bin %> alert enable alert_123",
  ];

  async run(): Promise<void> {
    await this.renderApp(<AlertHelp />);
  }
}

function AlertHelp(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>ImBIOS Alert Management accountsConfig.0</Text>
      <Text />
      <Text>Usage: relay alert &lt;command&gt; [options]</Text>
      <Text />
      <Text bold>Commands:</Text>
      <Text> list List all alerts</Text>
      <Text> add Add a new alert</Text>
      <Text> enable &lt;id&gt; Enable an alert</Text>
      <Text> disable &lt;id&gt; Disable an alert</Text>
      <Text />
      <Text bold>Examples:</Text>
      <Text> relay alert list</Text>
      <Text> relay alert add</Text>
      <Text> relay alert enable alert_123</Text>
    </Box>
  );
}
