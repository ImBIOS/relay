import { spawn } from "node:child_process";
import { Spinner } from "@inkjs/ui";
import { Args } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import * as mcp from "../../config/mcp";
import { BaseCommand } from "../../oclif/base";
import {
  Error as ErrorBadge,
  Info,
  Section,
  Success,
  Warning,
} from "../../ui/index";

export default class McpTest extends BaseCommand<typeof McpTest> {
  static description = "Test an MCP server connection";
  static examples = ["<%= config.bin %> mcp test server-name"];

  static args = {
    name: Args.string({
      description: "MCP server name to test",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const name = this.args.name;
    const server = mcp.getMcpServer(name);

    if (!server) {
      await this.renderApp(
        <Box>
          <ErrorBadge>MCP server "{name}" not found.</ErrorBadge>
        </Box>
      );
      return;
    }

    await this.renderApp(<McpTestUI name={name} server={server} />);
  }
}

interface McpServer {
  name: string;
  command: string;
  args: string[];
}

interface McpTestUIProps {
  name: string;
  server: McpServer;
}

function McpTestUI({ name, server }: McpTestUIProps): React.ReactElement {
  const { exit } = useApp();
  const [testing, setTesting] = useState(true);
  const [success, setSuccess] = useState(false);
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    const env = mcp.getMcpEnvForServer(name);
    const child = spawn(server.command, server.args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdoutData += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderrData += data.toString();
    });

    child.on("close", (code: number) => {
      setStdout(stdoutData);
      setStderr(stderrData);
      setExitCode(code);
      setSuccess(code === 0);
      setTesting(false);
    });

    child.on("error", (err: Error) => {
      setStderr(err.message);
      setSuccess(false);
      setTesting(false);
    });

    // Kill after 10 seconds
    const timeout = setTimeout(() => {
      child.kill();
      setTesting(false);
      setSuccess(true);
    }, 10_000);

    return () => {
      clearTimeout(timeout);
      child.kill();
    };
  }, [name, server]);

  // Exit after showing results
  useEffect(() => {
    if (!testing) {
      const timer = setTimeout(() => exit(), 1000);
      return () => clearTimeout(timer);
    }
  }, [testing, exit]);

  return (
    <Section title={`Testing MCP Server: ${name}`}>
      <Box flexDirection="column">
        <Info>
          Running: {server.command} {server.args.join(" ")}
        </Info>
        <Box marginTop={1} />

        {testing ? (
          <Spinner label="Testing server..." />
        ) : success ? (
          <Box flexDirection="column">
            <Success>Server started successfully!</Success>
            {stdout && (
              <Box flexDirection="column" marginTop={1}>
                <Info>Output:</Info>
                <Text>{stdout.slice(0, 500)}</Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box flexDirection="column">
            <ErrorBadge>Server exited with code {exitCode}</ErrorBadge>
            {stderr && (
              <Box flexDirection="column" marginTop={1}>
                <Warning>Stderr:</Warning>
                <Text>{stderr.slice(0, 500)}</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Section>
  );
}
