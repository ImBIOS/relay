import { PasswordInput, Select, TextInput } from "@inkjs/ui";
import { Flags } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import { addAccount, getActiveAccount, switchAccount } from "../../config/accounts-config";
import {
  getDefaultBaseUrl,
  getProviderCliLabel,
  isRelayProvider,
  listRelayProviders,
  type RelayProvider,
} from "../../config/provider-metadata";
import * as settings from "../../config/settings";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Section, Success } from "../../ui/index";

const PROVIDER_OPTIONS = listRelayProviders().map((provider) => ({
  label: getProviderCliLabel(provider),
  value: provider,
}));

function isRawModeSupported(): boolean {
  const stdin = process.stdin as { isRawModeSupported?: boolean };
  return (
    typeof stdin.isRawModeSupported === "boolean" && stdin.isRawModeSupported
  );
}

export default class AccountAdd extends BaseCommand<typeof AccountAdd> {
  static description = "Add a new account";
  static examples = [
    "<%= config.bin %> account add",
    "<%= config.bin %> account add --name zai --provider zai --key sk-xxx",
    "<%= config.bin %> account add --name minimax --provider minimax --api-key mmkey-xxx --group-id grp-123",
  ];

  static flags = {
    name: Flags.string({ description: "Account name" }),
    provider: Flags.string({
      description: "Provider for the account",
      options: listRelayProviders(),
    }),
    "api-key": Flags.string({ description: "API key for the account" }),
    key: Flags.string({ description: "Alias for --api-key" }),
    "base-url": Flags.string({ description: "Override provider base URL" }),
    "group-id": Flags.string({
      description: "MiniMax GroupId for usage tracking (optional)",
    }),
    activate: Flags.boolean({
      description: "Make the new account active immediately",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AccountAdd);
    const providedApiKey = flags["api-key"] || flags.key;
    const hasFlagInput = Boolean(
      flags.name ||
        flags.provider ||
        providedApiKey ||
        flags["base-url"] ||
        flags["group-id"] ||
        flags.activate
    );

    if (hasFlagInput) {
      await this.runNonInteractive({
        name: flags.name,
        provider: flags.provider,
        apiKey: flags["api-key"],
        key: flags.key,
        baseUrl: flags["base-url"],
        groupId: flags["group-id"],
        activate: flags.activate,
      });
      return;
    }

    if (!isRawModeSupported()) {
      await this.renderApp(
        <Section title="Add Account">
          <Box flexDirection="column">
            <ErrorBadge>
              Interactive account setup requires a TTY-enabled terminal.
            </ErrorBadge>
            <Info>
              Use a non-interactive command instead, for example:
            </Info>
            <Info>
              relay account add --name zai --provider zai --key sk-xxx
            </Info>
          </Box>
        </Section>
      );
      return;
    }

    await this.renderApp(<AccountAddUI />);
  }

  private async runNonInteractive(input: {
    name?: string;
    provider?: string;
    apiKey?: string;
    key?: string;
    baseUrl?: string;
    groupId?: string;
    activate: boolean;
  }): Promise<void> {
    const apiKey = input.apiKey || input.key;

    if (input.apiKey && input.key && input.apiKey !== input.key) {
      throw new Error("Provide only one of --api-key or --key.");
    }

    if (!input.name || !input.provider || !apiKey) {
      throw new Error(
        "Non-interactive mode requires --name, --provider, and --api-key/--key."
      );
    }

    if (!isRelayProvider(input.provider)) {
      throw new Error(
        `Unsupported provider \"${input.provider}\". Use one of: ${listRelayProviders().join(", ")}.`
      );
    }

    const provider = input.provider;
    const baseUrl = input.baseUrl || getDefaultBaseUrl(provider);
    const hadActiveAccount = Boolean(getActiveAccount());
    const account = addAccount(
      input.name,
      provider,
      apiKey,
      baseUrl,
      input.groupId || undefined
    );

    settings.setProviderConfig(provider, apiKey, baseUrl);

    const activated = input.activate || !hadActiveAccount;
    if (activated) {
      switchAccount(account.id);
      settings.setActiveProvider(provider);
    }

    console.log(`Added account \"${account.name}\" (${account.provider}).`);
    console.log(`Account ID: ${account.id}`);
    console.log(`Base URL: ${account.baseUrl}`);
    if (account.groupId) {
      console.log(`Group ID: ${account.groupId}`);
    }
    console.log(`Active: ${activated ? "yes" : "no"}`);
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
  const [provider, setProvider] = useState<RelayProvider>("zai");
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
    if (!isRelayProvider(value)) {
      setError(`Unsupported provider: ${value}`);
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }

    setProvider(value);
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
    setBaseUrl(getDefaultBaseUrl(provider));
    setStep(provider === "minimax" ? "group-id" : "base-url");
  };

  const handleGroupIdSubmit = (value: string) => {
    setGroupId(value);
    setStep("base-url");
  };

  const handleBaseUrlSubmit = (value: string) => {
    const finalBaseUrl = value || getDefaultBaseUrl(provider);
    const hadActiveAccount = Boolean(getActiveAccount());

    const account = addAccount(
      name,
      provider,
      apiKey,
      finalBaseUrl,
      groupId || undefined
    );

    settings.setProviderConfig(provider, apiKey, finalBaseUrl);
    if (!hadActiveAccount) {
      switchAccount(account.id);
      settings.setActiveProvider(provider);
    }

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
              <Text>MiniMax GroupId (optional, improves usage tracking): </Text>
            </Box>
            <Box>
              <TextInput
                defaultValue=""
                onSubmit={handleGroupIdSubmit}
                placeholder="Enter GroupId or leave blank..."
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
              defaultValue={getDefaultBaseUrl(provider)}
              onSubmit={handleBaseUrlSubmit}
            />
          </Box>
        )}

        {step === "done" && (
          <Box flexDirection="column">
            <Success>Account "{name}" added successfully!</Success>
            <Info>Account ID: {accountId}</Info>
            <Info>Provider: {provider}</Info>
            <Info>Base URL: {_baseUrl || getDefaultBaseUrl(provider)}</Info>
            {groupId && <Info>GroupId: {groupId}</Info>}
          </Box>
        )}

        {step === "error" && <ErrorBadge>{error}</ErrorBadge>}
      </Box>
    </Section>
  );
}
