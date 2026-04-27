import { Args } from "@oclif/core";
import { Box } from "ink";
import * as mcp from "../../config/mcp";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Success } from "../../ui/index";

export default class McpAddPredefined extends BaseCommand<typeof McpAddPredefined> {
  static description = "Add predefined MCP servers for a provider";
  static examples = [
    "<%= config.bin %> mcp add-predefined zai",
    "<%= config.bin %> mcp add-predefined minimax",
  ];

  static args = {
    provider: Args.string({
      description: "Provider to add predefined servers for",
      required: true,
      options: ["zai", "minimax"],
    }),
  };

  async run(): Promise<void> {
    const provider = this.args.provider as "zai" | "minimax";

    if (!["zai", "minimax"].includes(provider)) {
      await this.renderApp(
        <Box>
          <ErrorBadge>Usage: relay mcp add-predefined &lt;zai|minimax&gt;</ErrorBadge>
        </Box>,
      );
      return;
    }

    mcp.addPredefinedServers(provider);

    const predefined = provider === "zai" ? mcp.ZAI_MCP_SERVERS : mcp.MINIMAX_MCP_SERVERS;
    const serverCount = Object.keys(predefined).length;

    await this.renderApp(
      <Box flexDirection="column">
        <Success>
          Added {serverCount} predefined {provider.toUpperCase()} MCP servers.
        </Success>
        <Info>
          Use 'relay mcp list' to see them, then 'relay mcp enable &lt;name&gt;' to enable.
        </Info>
      </Box>,
    );
  }
}
