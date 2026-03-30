import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";

export default class Profile extends BaseCommand<typeof Profile> {
  static description = "Manage configuration profiles";
  static examples = [
    "<%= config.bin %> profile list",
    "<%= config.bin %> profile create",
    "<%= config.bin %> profile switch work",
  ];

  async run(): Promise<void> {
    await this.renderApp(<ProfileHelp />);
  }
}

function ProfileHelp(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>ImBIOS Profile Management</Text>
      <Text />
      <Text>Usage: relay profile &lt;command&gt; [options]</Text>
      <Text />
      <Text bold>Commands:</Text>
      <Text> list List all profiles</Text>
      <Text> create Create a new profile</Text>
      <Text> switch &lt;name&gt; Switch to a profile</Text>
      <Text> delete &lt;name&gt; Delete a profile</Text>
      <Text> export [name] Export profile as shell vars</Text>
      <Text />
      <Text bold>Examples:</Text>
      <Text> relay profile list</Text>
      <Text> relay profile create work</Text>
      <Text> relay profile switch work</Text>
      <Text> eval "$(relay profile export work)"</Text>
    </Box>
  );
}
