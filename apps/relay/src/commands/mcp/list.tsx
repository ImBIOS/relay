import { Box, Text } from "ink";
import type React from "react";
import * as mcp from "../../config/mcp";
import { BaseCommand } from "../../oclif/base";
import { Info, Section } from "../../ui/index";

export default class McpList extends BaseCommand<typeof McpList> {
  static description = "List all configured MCP servers";
  static examples = ["<%= config.bin %> mcp list"];

  async run(): Promise<void> {
    const servers = mcp.listMcpServers();
    await this.renderApp(<McpListUI servers={servers} />);
  }
}

interface McpServer {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  provider?: string;
  description?: string;
}

interface McpListUIProps {
  servers: McpServer[];
}

function McpListUI({ servers }: McpListUIProps): React.ReactElement {
  if (servers.length === 0) {
    return (
      <Section title="MCP Servers">
        <Box flexDirection="column">
          <Info>No MCP servers configured.</Info>
          <Info>Use 'relay mcp add' to add a server.</Info>
        </Box>
      </Section>
    );
  }

  const enabledCount = servers.filter((s) => s.enabled).length;

  return (
    <Section title="MCP Servers">
      <Box flexDirection="column">
        <Text>
          Total: {servers.length} | Enabled: {enabledCount}
        </Text>
        <Box marginTop={1} />
        {servers.map((server) => (
          <Box flexDirection="column" key={server.name} marginBottom={1}>
            <Box>
              <Text color={server.enabled ? "green" : "gray"}>
                {server.enabled ? "●" : "○"}{" "}
              </Text>
              <Text bold>{server.name}</Text>
              <Text color="cyan"> [{server.provider || "all"}]</Text>
              {!server.enabled && <Text color="gray"> (disabled)</Text>}
            </Box>
            <Box paddingLeft={4}>
              <Text color="gray">
                {server.command} {server.args.join(" ")}
              </Text>
            </Box>
            {server.description && (
              <Box paddingLeft={4}>
                <Text>{server.description}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Section>
  );
}
