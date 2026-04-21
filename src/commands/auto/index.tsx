import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";

export default class Auto extends BaseCommand<typeof Auto> {
  static description = "Cross-provider auto-rotation";
  static examples = [
    "<%= config.bin %> auto enable round-robin",
    "<%= config.bin %> auto status",
    "<%= config.bin %> auto rotate",
  ];

  async run(): Promise<void> {
    await this.renderApp(<AutoHelp />);
  }
}

function AutoHelp(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>ImBIOS Auto-Rotation</Text>
      <Text />
      <Text>Usage: relay auto &lt;command&gt; [options]</Text>
      <Text />
      <Text bold>Commands:</Text>
      <Text> enable [strategy] Enable auto-rotation</Text>
      <Text> disable Disable auto-rotation</Text>
      <Text> status Show current rotation status</Text>
      <Text> rotate Manually trigger rotation</Text>
      <Text> hook SessionStart hook (for internal use)</Text>
      <Text />
      <Text bold>Options:</Text>
      <Text> --cross-provider Enable cross-provider rotation</Text>
      <Text />
      <Text bold>Strategies:</Text>
      <Text> round-robin Cycle through accounts sequentially</Text>
      <Text> least-used Pick account with lowest usage</Text>
      <Text> priority Pick highest priority account</Text>
      <Text> random Randomly select account</Text>
      <Text />
      <Text bold>Examples:</Text>
      <Text> relay auto enable round-robin</Text>
      <Text> relay auto enable random --cross-provider</Text>
      <Text> relay auto status</Text>
      <Text> relay auto rotate</Text>
      <Text> relay auto hook --silent</Text>
    </Box>
  );
}
