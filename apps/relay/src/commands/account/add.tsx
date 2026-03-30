import { PasswordInput, Select, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import { addAccount } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import type { Provider } from "../../providers/base";
import { minimaxProvider } from "../../providers/minimax";
import { zaiProvider } from "../../providers/zai";
import { Error as ErrorBadge, Info, Section, Success } from "../../ui/index";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

const PROVIDER_OPTIONS = [
  { label: "Z.AI (zai)", value: "zai" },
  { label: "MiniMax (minimax)", value: "minimax" },
];

export default class AccountAdd extends BaseCommand<typeof AccountAdd> {
  static description = "Add a new account";
  static examples = ["<%= config.bin %> account add"];

  async run(): Promise<void> {
    await this.renderApp(<AccountAddUI />);
  }
}

type AddStep =
  | "name"
  | "provider"
  | "api-key"
  | "group-id"
  | "base-url"
  | "done"
  | "error";

function AccountAddUI(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<AddStep>("name");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<"zai" | "minimax">("zai");
  const [apiKey, setApiKey] = useState("");
  const [groupId, setGroupId] = useState("");
  const [_baseUrl, setBaseUrl] = useState("");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");

  const handleNameSubmit = (value: string) => {
    if (!value) {
      setError("Account name is required.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setName(value);
    setStep("provider");
  };

  const handleProviderChange = (value: string) => {
    setProvider(value as "zai" | "minimax");
    setStep("api-key");
  };

  const handleApiKeySubmit = (value: string) => {
    if (!value) {
      setError("API key is required.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setApiKey(value);
    setBaseUrl(PROVIDERS[provider]().getConfig().baseUrl);
    // Skip group-id step for Z.AI, go straight to base-url
    setStep(provider === "minimax" ? "group-id" : "base-url");
  };

  const handleGroupIdSubmit = (value: string) => {
    if (!value) {
      setError("GroupId is required for MiniMax accounts.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setGroupId(value);
    setStep("base-url");
  };

  const handleBaseUrlSubmit = (value: string) => {
    const finalBaseUrl = value || PROVIDERS[provider]().getConfig().baseUrl;

    const account = addAccount(
      name,
      provider,
      apiKey,
      finalBaseUrl,
      groupId || undefined
    );
    setAccountId(account.id);
    setStep("done");
    setTimeout(() => exit(), 500);
  };

  return (
    <Section title="Add Account">
      <Box flexDirection="column">
        {step === "name" && (
          <Box>
            <Text>Account name: </Text>
            <TextInput
              onSubmit={handleNameSubmit}
              placeholder="Enter account name..."
            />
          </Box>
        )}

        {step === "provider" && (
          <Box flexDirection="column">
            <Text>Select provider:</Text>
            <Box paddingLeft={2}>
              <Select
                onChange={handleProviderChange}
                options={PROVIDER_OPTIONS}
              />
            </Box>
          </Box>
        )}

        {step === "api-key" && (
          <Box>
            <Text>API Key for {provider}: </Text>
            <PasswordInput
              onSubmit={handleApiKeySubmit}
              placeholder="Enter API key..."
            />
          </Box>
        )}

        {step === "group-id" && provider === "minimax" && (
          <Box flexDirection="column">
            <Box>
              <Text>MiniMax GroupId (required for usage tracking): </Text>
            </Box>
            <Box>
              <TextInput
                defaultValue=""
                onSubmit={handleGroupIdSubmit}
                placeholder="Enter GroupId..."
              />
            </Box>
            <Box>
              <Text dimColor>
                Found in browser DevTools when visiting{" "}
                https://platform.minimax.io/user-center/payment/coding-plan
              </Text>
            </Box>
          </Box>
        )}

        {step === "base-url" && (
          <Box>
            <Text>Base URL: </Text>
            <TextInput
              defaultValue={PROVIDERS[provider]().getConfig().baseUrl}
              onSubmit={handleBaseUrlSubmit}
            />
          </Box>
        )}

        {step === "done" && (
          <Box flexDirection="column">
            <Success>Account "{name}" added successfully!</Success>
            <Info>Account ID: {accountId}</Info>
            <Info>Provider: {provider}</Info>
            {groupId && <Info>GroupId: {groupId}</Info>}
          </Box>
        )}

        {step === "error" && <ErrorBadge>{error}</ErrorBadge>}
      </Box>
    </Section>
  );
}
