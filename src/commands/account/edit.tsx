import { PasswordInput, TextInput } from "@inkjs/ui";
import { Args } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import type { AccountConfig } from "../../config/accounts-config";
import { loadConfig, updateAccount } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Section, Success, Warning } from "../../ui/index";

function isRawModeSupported(): boolean {
  // Node.js ReadStream has isRawModeSupported property
  const stdin = process.stdin as { isRawModeSupported?: boolean };
  return typeof stdin.isRawModeSupported === "boolean" && stdin.isRawModeSupported;
}

/**
 * Parse flags from argv array (since CLI router doesn't parse flags automatically)
 * Skips the first element which is the account ID
 */
function parseFlags(argv: string[]): {
  name?: string;
  "api-key"?: string;
  groupId?: string;
  "base-url"?: string;
} {
  const flags: Record<string, string | undefined> = {};
  // Skip first element (account ID)
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const flagName = arg.slice(2);
      const nextArg = argv[i + 1];
      // Check if next arg is a value (not a flag)
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        flags[flagName] = nextArg;
        i++; // Skip next arg since we consumed it
      } else {
        flags[flagName] = undefined;
      }
    } else if (arg.startsWith("-") && !arg.startsWith("--")) {
      const flagName = arg.slice(1);
      const nextArg = argv[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        flags[flagName] = nextArg;
        i++;
      } else {
        flags[flagName] = undefined;
      }
    }
  }
  return flags as {
    name?: string;
    "api-key"?: string;
    groupId?: string;
    "base-url"?: string;
  };
}

export default class AccountEdit extends BaseCommand<typeof AccountEdit> {
  static description = "Edit an existing account";
  static strict = false; // Allow unknown flags for non-interactive mode
  static examples = [
    "<%= config.bin %> account edit <account-id>",
    "<%= config.bin %> account edit <account-id> --name <value>",
    "<%= config.bin %> account edit <account-id> --group-id <value>",
  ];
  static args = {
    id: Args.string({
      description: "Account ID to edit",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const config = loadConfig();
    const accountId = this.argv?.[0];
    const flags = parseFlags(this.argv || []);
    const account = config.accounts[accountId as string];

    if (!account) {
      await this.renderApp(
        <Section title="Edit Account">
          <ErrorBadge>Account not found: {this.args.id as string}</ErrorBadge>
        </Section>,
      );
      return;
    }

    // Check if any flags were provided for non-interactive update
    const hasFlags = flags.name || flags["api-key"] || flags.groupId || flags["base-url"];

    if (hasFlags) {
      // Non-interactive mode: update with provided flags
      const updates: Partial<AccountConfig> = {};

      if (flags.name) {
        updates.name = flags.name;
      }
      if (flags["api-key"]) {
        updates.apiKey = flags["api-key"];
      }
      if (flags.groupId) {
        updates.groupId = flags.groupId;
      }
      if (flags["base-url"]) {
        updates.baseUrl = flags["base-url"];
      }

      const updated = updateAccount(account.id, updates);
      if (updated) {
        console.log("");
        console.log(Success({ children: "Account updated successfully!" }));
        console.log(Info({ children: `Name: ${updated.name}` }));
        console.log(Info({ children: `Provider: ${updated.provider}` }));
        if (updated.groupId) {
          console.log(Info({ children: `GroupId: ${updated.groupId}` }));
        }
      } else {
        console.error("");
        console.error(ErrorBadge({ children: "Failed to update account." }));
      }
      return;
    }

    // Check raw mode support before rendering interactive UI
    const rawModeAvailable = isRawModeSupported();

    await this.renderApp(<AccountEditUI account={account} rawModeAvailable={rawModeAvailable} />);
  }
}

type EditStep = "menu" | "name" | "api-key" | "group-id" | "base-url" | "done" | "error";

interface AccountEditUIProps {
  account: AccountConfig;
  rawModeAvailable: boolean;
}

function AccountEditUI({ account, rawModeAvailable }: AccountEditUIProps): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<EditStep>("menu");
  const [accountState, setAccountState] = useState(account);
  const [error, setError] = useState("");

  const handleMenuSelect = (value: string) => {
    switch (value) {
      case "name":
        setStep("name");
        break;
      case "api-key":
        setStep("api-key");
        break;
      case "group-id":
        setStep("group-id");
        break;
      case "base-url":
        setStep("base-url");
        break;
      case "done":
        setStep("done");
        break;
      default:
        // Handle unknown values silently
        break;
    }
  };

  const handleNameSubmit = (value: string) => {
    if (!value) {
      setError("Account name cannot be empty.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setAccountState({ ...accountState, name: value });
    saveAndExit({ name: value });
  };

  const handleApiKeySubmit = (value: string) => {
    if (!value) {
      setError("API key cannot be empty.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setAccountState({ ...accountState, apiKey: value });
    saveAndExit({ apiKey: value });
  };

  const handleGroupIdSubmit = (value: string) => {
    if (accountState.provider === "minimax" && !value) {
      setError("GroupId is required for MiniMax accounts.");
      setStep("error");
      setTimeout(() => exit(), 500);
      return;
    }
    setAccountState({ ...accountState, groupId: value || undefined });
    saveAndExit({ groupId: value || undefined });
  };

  const handleBaseUrlSubmit = (value: string) => {
    const finalBaseUrl = value || accountState.baseUrl;
    setAccountState({ ...accountState, baseUrl: finalBaseUrl });
    saveAndExit({ baseUrl: finalBaseUrl });
  };

  const saveAndExit = (updates: Partial<AccountConfig>) => {
    const updated = updateAccount(account.id, updates);
    if (updated) {
      setAccountState(updated);
      setStep("done");
      setTimeout(() => exit(), 500);
    } else {
      setError("Failed to update account.");
      setStep("error");
      setTimeout(() => exit(), 500);
    }
  };

  // Show error when raw mode is not supported (before interactive UI)
  if (!rawModeAvailable) {
    return (
      <Section title="Edit Account">
        <Box flexDirection="column">
          <Info>
            Editing: {accountState.name} ({accountState.provider})
          </Info>
          <Box marginTop={1}>
            <Warning>
              Interactive mode requires a terminal that supports raw keyboard input.
            </Warning>
          </Box>
          <Box marginTop={1}>
            <Text>
              Please run this command in a supported terminal, or use flags to edit values directly:
            </Text>
          </Box>
          <Box marginTop={1} paddingLeft={2}>
            <Text dimColor>
              relay account edit &lt;account-id&gt; --name &lt;value&gt; --api-key &lt;value&gt;
            </Text>
          </Box>
          <Box marginTop={1} paddingLeft={2}>
            <Text dimColor>
              relay account edit &lt;account-id&gt; --group-id &lt;value&gt; --base-url
              &lt;value&gt;
            </Text>
          </Box>
        </Box>
      </Section>
    );
  }

  return (
    <Section title="Edit Account">
      <Box flexDirection="column">
        <Info>
          Editing: {accountState.name} ({accountState.provider})
        </Info>

        {step === "menu" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>What would you like to edit?</Text>
            <Box marginTop={1} paddingLeft={2}>
              <Text>1. </Text>
              <Text bold>Name</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text>2. </Text>
              <Text bold>API Key</Text>
            </Box>
            {accountState.provider === "minimax" && (
              <Box paddingLeft={2}>
                <Text>3. </Text>
                <Text bold>GroupId</Text>
                {!accountState.groupId && (
                  <Text color="yellow"> (not set - required for usage)</Text>
                )}
              </Box>
            )}
            <Box paddingLeft={2}>
              <Text>{accountState.provider === "minimax" ? "4" : "3"}. </Text>
              <Text bold>Base URL</Text>
            </Box>
            <Box paddingLeft={2}>
              <Text>{accountState.provider === "minimax" ? "5" : "4"}. </Text>
              <Text dimColor>Done</Text>
            </Box>
            <Box marginTop={1}>
              <Text>
                Enter choice (1-
                {accountState.provider === "minimax" ? "5" : "4"}):{" "}
              </Text>
              <TextInput
                onSubmit={(value) => {
                  const choice = value.trim();
                  if (accountState.provider === "minimax") {
                    if (choice === "1") {
                      handleMenuSelect("name");
                    } else if (choice === "2") {
                      handleMenuSelect("api-key");
                    } else if (choice === "3") {
                      handleMenuSelect("group-id");
                    } else if (choice === "4") {
                      handleMenuSelect("base-url");
                    } else if (choice === "5") {
                      handleMenuSelect("done");
                    } else {
                      setError("Invalid choice.");
                      setStep("error");
                      setTimeout(() => exit(), 500);
                    }
                  } else if (choice === "1") {
                    handleMenuSelect("name");
                  } else if (choice === "2") {
                    handleMenuSelect("api-key");
                  } else if (choice === "3") {
                    handleMenuSelect("base-url");
                  } else if (choice === "4") {
                    handleMenuSelect("done");
                  } else {
                    setError("Invalid choice.");
                    setStep("error");
                    setTimeout(() => exit(), 500);
                  }
                }}
                placeholder="Enter number..."
              />
            </Box>
          </Box>
        )}

        {step === "name" && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text>Current name: </Text>
              <Text bold>{accountState.name}</Text>
            </Box>
            <Box>
              <Text>New name: </Text>
              <TextInput onSubmit={handleNameSubmit} placeholder="Enter new name..." />
            </Box>
          </Box>
        )}

        {step === "api-key" && (
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text>Current API key: </Text>
              <Text dimColor>{accountState.apiKey.slice(0, 8)}...</Text>
            </Box>
            <Box>
              <Text>New API key: </Text>
              <PasswordInput onSubmit={handleApiKeySubmit} placeholder="Enter new API key..." />
            </Box>
          </Box>
        )}

        {step === "group-id" && (
          <Box flexDirection="column" marginTop={1}>
            {accountState.provider === "minimax" && !accountState.groupId && (
              <Warning>GroupId is required for MiniMax usage tracking</Warning>
            )}
            <Box>
              <Text>
                Current GroupId:{" "}
                {accountState.groupId ? (
                  <Text bold>{accountState.groupId}</Text>
                ) : (
                  <Text color="yellow">(not set)</Text>
                )}
              </Text>
            </Box>
            <Box>
              <Text>New GroupId: </Text>
              <TextInput onSubmit={handleGroupIdSubmit} placeholder="Enter GroupId..." />
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
          <Box flexDirection="column" marginTop={1}>
            <Box>
              <Text>Current base URL: </Text>
              <Text bold>{accountState.baseUrl}</Text>
            </Box>
            <Box>
              <Text>New base URL: </Text>
              <TextInput defaultValue={accountState.baseUrl} onSubmit={handleBaseUrlSubmit} />
            </Box>
          </Box>
        )}

        {step === "done" && (
          <Box flexDirection="column" marginTop={1}>
            <Success>Account updated successfully!</Success>
            <Info>Name: {accountState.name}</Info>
            <Info>Provider: {accountState.provider}</Info>
            {accountState.groupId && <Info>GroupId: {accountState.groupId}</Info>}
          </Box>
        )}

        {step === "error" && <ErrorBadge>{error}</ErrorBadge>}
      </Box>
    </Section>
  );
}
