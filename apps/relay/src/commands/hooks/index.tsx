import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";

export default class HooksIndex extends BaseCommand<typeof HooksIndex> {
  static description = "Manage Claude Code hooks";
  static examples = [
    "<%= config.bin %> hooks setup",
    "<%= config.bin %> hooks uninstall",
    "<%= config.bin %> hooks status",
    "<%= config.bin %> hooks post-tool",
    "<%= config.bin %> hooks stop",
  ];

  async run(): Promise<void> {
    await this.renderApp(
      <Box flexDirection="column">
        <Text bold>Claude Code Hooks Management</Text>
        <Box marginTop={1}>
          <Text>Commands:</Text>
        </Box>
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text>
            • <Text bold>setup</Text> - Install hooks globally
          </Text>
          <Text>
            • <Text bold>uninstall</Text> - Remove hooks
          </Text>
          <Text>
            • <Text bold>status</Text> - Check hook installation status
          </Text>
          <Text>
            • <Text bold>post-tool</Text> - Format files after Write|Edit
          </Text>
          <Text>
            • <Text bold>stop</Text> - Session end notifications + commit prompt
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Hooks enable auto-rotation, formatting, and commit prompts.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            For notifications, we recommend <Text bold>peon-ping</Text> instead.
          </Text>
        </Box>
      </Box>
    );
  }
}
