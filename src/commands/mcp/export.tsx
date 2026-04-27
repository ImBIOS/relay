import { Args } from "@oclif/core";
import { Box } from "ink";
import * as mcp from "../../config/mcp";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info } from "../../ui/index";

export default class McpExport extends BaseCommand<typeof McpExport> {
  static description = "Export MCP configuration";
  static examples = [
    "<%= config.bin %> mcp export env",
    "<%= config.bin %> mcp export claude",
    'eval "$(<%= config.bin %> mcp export env)"',
  ];

  static args = {
    format: Args.string({
      description: "Export format (env or claude)",
      required: false,
      default: "env",
      options: ["env", "claude"],
    }),
  };

  async run(): Promise<void> {
    const format = this.args.format || "env";

    if (format === "env") {
      console.log(mcp.generateMcpEnvExport());
      await this.renderApp(
        <Box>
          <Info>Run 'eval "$(relay mcp export env)"' to apply.</Info>
        </Box>,
      );
    } else if (format === "claude") {
      console.log(mcp.generateClaudeDesktopConfig());
      await this.renderApp(
        <Box>
          <Info>Save this to ~/.config/claude/mcp.json for Claude Desktop.</Info>
        </Box>,
      );
    } else {
      await this.renderApp(
        <Box>
          <ErrorBadge>Unknown format: {format}. Use 'env' or 'claude'.</ErrorBadge>
        </Box>,
      );
    }
  }
}
