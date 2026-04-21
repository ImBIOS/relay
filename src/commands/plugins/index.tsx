import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";

export default class PluginsIndex extends BaseCommand<typeof PluginsIndex> {
  static description = "Manage OpenCode plugins (commit, format)";
  static examples = [
    "<%= config.bin %> plugins install",
    "<%= config.bin %> plugins uninstall",
    "<%= config.bin %> plugins status",
  ];

  async run(): Promise<void> {
    await this.renderApp(
      <Box flexDirection="column">
        <Text bold>OpenCode Plugins Management</Text>
        <Box marginTop={1}>
          <Text>Commands:</Text>
        </Box>
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text>
            • <Text bold>install</Text> - Install all relay plugins
          </Text>
          <Text>
            • <Text bold>uninstall</Text> - Remove all relay plugins
          </Text>
          <Text>
            • <Text bold>status</Text> - Check plugin installation status
          </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Available Plugins:</Text>
          <Box marginLeft={2} flexDirection="column">
            <Text>
              • <Text bold>relay-commit</Text> - AI-powered auto stage, commit, and push with parallel security + performance analysis
            </Text>
            <Text>
              • <Text bold>relay-format</Text> - Format files after Write/Edit tool calls
            </Text>
            <Text>
              • <Text bold>relay-security-analysis</Text> - Analyze staged changes for security vulnerabilities before commit
            </Text>
            <Text>
              • <Text bold>relay-performance-analysis</Text> - Analyze staged changes for performance anti-patterns before commit
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            Plugins are installed to ~/.config/opencode/plugins/ (global) or .opencode/plugins/
            (project).
          </Text>
        </Box>
      </Box>,
    );
  }
}
