import { Box, Text, useApp } from "ink";
import { useEffect } from "react";
import { BaseCommand } from "../oclif/base";

export default class Help extends BaseCommand<typeof Help> {
  static description = "Show help information";
  static examples = ["<%= config.bin %> help"];

  async run(): Promise<void> {
    const pkg = await import("../../package.json");
    await this.renderApp(<HelpUI version={pkg.version} />);
  }
}

function HelpUI({ version }: { version: string }): React.ReactElement {
  const { exit } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => exit(), 100);
    return () => clearTimeout(timer);
  }, [exit]);

  return (
    <Box flexDirection="column">
      <Text bold>RELAY - Z.AI &amp; MiniMax Provider Manager v{version}</Text>
      <Text />
      <Text>Usage: relay &lt;command&gt; [options]</Text>
      <Text />
      <Text bold>Commands:</Text>
      <Text> claude [args...] Spawn Claude with auto-switch</Text>
      <Text> config Configure API providers (interactive)</Text>
      <Text> switch &lt;provider&gt; Switch active provider (zai/minimax)</Text>
      <Text> status Show current provider and status</Text>
      <Text> usage Query quota and usage statistics</Text>
      <Text> history Show usage history</Text>
      <Text> cost [model] Estimate cost for a model</Text>
      <Text> test Test API connection</Text>
      <Text> plugin &lt;action&gt; Manage Claude Code plugin</Text>
      <Text> doctor Diagnose configuration issues</Text>
      <Text> init First-time setup wizard</Text>
      <Text> env export Export environment variables</Text>
      <Text> models [provider] List available models</Text>
      <Text>
        {" "}
        completion &lt;shell&gt; Generate shell completion (bash/zsh/fish)
      </Text>
      <Text> profile &lt;cmd&gt; Manage configuration profiles</Text>
      <Text> account &lt;cmd&gt; Multi-account management</Text>
      <Text> rotate &lt;provider&gt; Rotate to next API key</Text>
      <Text> dashboard &lt;cmd&gt; Web dashboard management</Text>
      <Text> alert &lt;cmd&gt; Alert configuration</Text>
      <Text> mcp &lt;cmd&gt; MCP server management</Text>
      <Text> auto &lt;cmd&gt; Cross-provider auto-rotation</Text>
      <Text> compare &lt;prompt&gt; Side-by-side Claude comparison</Text>
      <Text> help Show this help message</Text>
      <Text> version Show version</Text>
      <Text />
      <Text bold>Examples:</Text>
      <Text> relay claude # Run claude with auto-switch</Text>
      <Text>
        {" "}
        relay claude --continue # Run claude --continue with auto-switch
      </Text>
      <Text> relay config # Configure providers</Text>
      <Text> relay init # First-time setup wizard</Text>
      <Text>
        relay init --providers zai,minimax --zai-api-key sk-xxx --minimax-api-key mmkey-xxx --install-hooks
      </Text>
      <Text> relay switch minimax # Switch the legacy active provider</Text>
      <Text> relay account switch minimax # Switch account by provider/name/id</Text>
      <Text>
        relay account add --name work --provider zai --key sk-xxx --activate # Add account
      </Text>
      <Text> relay rotate zai # Rotate Z.AI key</Text>
      <Text> relay dashboard start # Start web dashboard</Text>
      <Text> relay mcp add-predefined zai # Add Z.AI MCP servers</Text>
      <Text> relay auto enable random --cross-provider</Text>
      <Text> relay compare "Write a React component"</Text>
      <Text> eval "$(relay env export)" # Export env vars</Text>
      <Text />
      <Text>For more info, visit: https://github.com/ImBIOS/relay</Text>
    </Box>
  );
}
