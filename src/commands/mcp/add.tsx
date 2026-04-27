import { Select, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import * as mcp from "../../config/mcp";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Section, Success } from "../../ui/index";

const PROVIDER_OPTIONS = [
  { label: "all", value: "all" },
  { label: "zai", value: "zai" },
  { label: "minimax", value: "minimax" },
];

export default class McpAdd extends BaseCommand<typeof McpAdd> {
  static description = "Add a new MCP server";
  static examples = ["<%= config.bin %> mcp add"];

  async run(): Promise<void> {
    await this.renderApp(<McpAddUI />);
  }
}

type AddStep = "name" | "command" | "args" | "provider" | "description" | "done" | "error";

function McpAddUI(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<AddStep>("name");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState<string[]>([]);
  const [provider, setProvider] = useState<"all" | "zai" | "minimax">("all");
  const [_description, setDescription] = useState("");
  const [error, setError] = useState("");

  const handleNameSubmit = (value: string) => {
    if (!value) {
      setError("Server name is required.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setName(value);
    setStep("command");
  };

  const handleCommandSubmit = (value: string) => {
    if (!value) {
      setError("Command is required.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setCommand(value);
    setStep("args");
  };

  const handleArgsSubmit = (value: string) => {
    setArgs(value.split(" ").filter((a) => a));
    setStep("provider");
  };

  const handleProviderChange = (value: string) => {
    setProvider(value as "all" | "zai" | "minimax");
    setStep("description");
  };

  const handleDescriptionSubmit = (value: string) => {
    setDescription(value);
    mcp.addMcpServer(name, command, args, {
      description: value,
      provider,
    });
    setStep("done");
    setTimeout(() => exit(), 500);
  };

  return (
    <Section title="Add MCP Server">
      <Box flexDirection="column">
        {step === "name" && (
          <Box>
            <Text>Server name: </Text>
            <TextInput onSubmit={handleNameSubmit} placeholder="Enter server name..." />
          </Box>
        )}

        {step === "command" && (
          <Box>
            <Text>Command: </Text>
            <TextInput defaultValue="npx" onSubmit={handleCommandSubmit} />
          </Box>
        )}

        {step === "args" && (
          <Box>
            <Text>Arguments (space-separated): </Text>
            <TextInput defaultValue="-y" onSubmit={handleArgsSubmit} />
          </Box>
        )}

        {step === "provider" && (
          <Box flexDirection="column">
            <Text>Provider:</Text>
            <Box paddingLeft={2}>
              <Select onChange={handleProviderChange} options={PROVIDER_OPTIONS} />
            </Box>
          </Box>
        )}

        {step === "description" && (
          <Box>
            <Text>Description (optional): </Text>
            <TextInput onSubmit={handleDescriptionSubmit} placeholder="Enter description..." />
          </Box>
        )}

        {step === "done" && (
          <Box flexDirection="column">
            <Success>MCP server "{name}" added successfully!</Success>
            <Info>Run 'relay mcp enable {name}' to enable it.</Info>
          </Box>
        )}

        {step === "error" && <ErrorBadge>{error}</ErrorBadge>}
      </Box>
    </Section>
  );
}
