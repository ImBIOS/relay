import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";

export default class Account extends BaseCommand<typeof Account> {
  static description = "Multi-account management";
  static examples = [
    "<%= config.bin %> account list",
    "<%= config.bin %> account add",
    "<%= config.bin %> account edit <id>",
    "<%= config.bin %> account switch acc_123",
  ];

  async run(): Promise<void> {
    await this.renderApp(<AccountHelp />);
  }
}

function AccountHelp(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>ImBIOS Multi-Account Management</Text>
      <Text />
      <Text>Usage: relay account &lt;command&gt; [options]</Text>
      <Text />
      <Text bold>Commands:</Text>
      <Text> list List all accounts</Text>
      <Text> add Add a new account</Text>
      <Text> edit &lt;id&gt; [flags] Edit an existing account</Text>
      <Text> switch &lt;id&gt; Switch to an account</Text>
      <Text> remove &lt;id&gt; Remove an account</Text>
      <Text />
      <Text bold>Edit flags:</Text>
      <Text> --name &lt;value&gt; Account name</Text>
      <Text> --api-key &lt;value&gt; API key</Text>
      <Text> --group-id &lt;value&gt; Group ID (MiniMax only)</Text>
      <Text> --base-url &lt;value&gt; Base URL</Text>
      <Text />
      <Text bold>Examples:</Text>
      <Text> relay account list</Text>
      <Text> relay account add</Text>
      <Text> relay account edit minimax_default</Text>
      <Text> relay account edit minimax_default --group-id 12345</Text>
      <Text> relay account switch acc_123456</Text>
    </Box>
  );
}
