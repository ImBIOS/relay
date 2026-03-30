import { Args } from "@oclif/core";
import { Box } from "ink";
import * as mcp from "../../config/mcp";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Success } from "../../ui/index";

export default class McpEnable extends BaseCommand<typeof McpEnable> {
  static description = "Enable an MCP server";
  static examples = ["<%= config.bin %> mcp enable server-name"];

  static args = {
    name: Args.string({
      description: "MCP server name to enable",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const name = this.args.name;

    if (mcp.toggleMcpServer(name, true)) {
      await this.renderApp(
        <Box>
          <Success>MCP server "{name}" enabled.</Success>
        </Box>
      );
    } else {
      await this.renderApp(
        <Box>
          <ErrorBadge>MCP server "{name}" not found.</ErrorBadge>
        </Box>
      );
    }
  }
}
