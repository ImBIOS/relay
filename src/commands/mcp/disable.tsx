import { Args } from "@oclif/core";
import { Box } from "ink";
import * as mcp from "../../config/mcp";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Success } from "../../ui/index";

export default class McpDisable extends BaseCommand<typeof McpDisable> {
  static description = "Disable an MCP server";
  static examples = ["<%= config.bin %> mcp disable server-name"];

  static args = {
    name: Args.string({
      description: "MCP server name to disable",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const name = this.args.name;

    if (mcp.toggleMcpServer(name, false)) {
      await this.renderApp(
        <Box>
          <Success>MCP server "{name}" disabled.</Success>
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
