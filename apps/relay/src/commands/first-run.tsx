import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ConfirmInput, PasswordInput, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import * as accountsConfig from "../config/accounts-config";
import { loadConfig } from "../config/accounts-config";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import {
  CustomMultiSelect,
  Info,
  Section,
  Success,
  Warning,
} from "../ui/index";
import { getContainerEnvVars } from "../utils/container";

const PROVIDERS = [
  { label: "Z.AI (GLM)", value: "zai" },
  { label: "MiniMax", value: "minimax" },
];

export default class FirstRun extends BaseCommand<typeof FirstRun> {
  static description = "First-time setup wizard for relay";
  static aliases = ["init"];
  static examples = ["<%= config.bin %> first-run", "<%= config.bin %> init"];

  async run(): Promise<void> {
    await this.renderApp(<FirstRunUI />);
  }
}

type Step =
  | "welcome"
  | "select-providers"
  | "configure-provider"
  | "enter-api-key"
  | "enter-base-url"
  | "confirm-hooks"
  | "setup-hooks"
  | "done";

interface ProviderSetup {
  provider: string;
  apiKey: string;
  baseUrl: string;
}

// Load existing config at module level
const existingConfig = loadConfig();
const existingProviders = [
  ...new Set(Object.values(existingConfig.accounts).map((acc) => acc.provider)),
];

function FirstRunUI(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedProviders, setSelectedProviders] =
    useState<string[]>(existingProviders);
  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
  const [currentSetup, setCurrentSetup] = useState<Partial<ProviderSetup>>({});
  const [completedProviders, setCompletedProviders] =
    useState<string[]>(existingProviders);
  const [hooksInstalled, setHooksInstalled] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ type: "info" | "success" | "warning"; text: string }>
  >([]);

  const currentProvider = selectedProviders[currentProviderIndex];

  // Check if a provider is already configured
  const isProviderConfigured = (provider: string): boolean => {
    return Object.values(existingConfig.accounts).some(
      (acc) => acc.provider === provider && acc.apiKey
    );
  };

  // Get existing config for a provider
  const getExistingProviderConfig = (
    provider: string
  ): { apiKey: string; baseUrl: string } | null => {
    const account = Object.values(existingConfig.accounts).find(
      (acc) => acc.provider === provider
    );
    if (account && account.apiKey) {
      return { apiKey: account.apiKey, baseUrl: account.baseUrl };
    }
    return null;
  };

  const addMessage = (type: "info" | "success" | "warning", text: string) => {
    setMessages((prev) => [...prev, { type, text }]);
  };

  const handleWelcomeConfirm = () => {
    setStep("select-providers");
  };

  const handleProvidersSelected = (providers: string[]) => {
    if (providers.length === 0) {
      addMessage("warning", "No providers selected.");
      return;
    }
    setSelectedProviders(providers);
    setCurrentProviderIndex(0);
    setCurrentSetup({});

    // Check if ALL providers are already configured - skip to hooks
    const allConfigured = providers.every((p) => isProviderConfigured(p));
    if (allConfigured && providers.length > 0) {
      addMessage("info", "All selected providers already configured.");
      setCompletedProviders(providers);
      setStep("confirm-hooks");
      return;
    }

    // Check if first provider is already configured
    if (isProviderConfigured(providers[0])) {
      addMessage("info", `${providers[0].toUpperCase()} already configured.`);
      moveToNextProvider();
    } else {
      setStep("enter-api-key");
      addMessage("info", `Configuring ${providers[0].toUpperCase()}...`);
    }
  };

  const handleApiKeySubmit = (apiKey: string) => {
    // Skip if provider is already configured
    if (isProviderConfigured(currentProvider)) {
      addMessage(
        "info",
        `${currentProvider.toUpperCase()} already configured.`
      );
      moveToNextProvider();
      return;
    }

    if (!apiKey) {
      addMessage(
        "warning",
        `Skipping ${currentProvider.toUpperCase()} - no API key provided.`
      );
      moveToNextProvider();
      return;
    }
    setCurrentSetup({ provider: currentProvider, apiKey });
    setStep("enter-base-url");
  };

  const handleBaseUrlSubmit = (baseUrl: string) => {
    const finalConfig = {
      ...currentSetup,
      baseUrl: baseUrl || getDefaultBaseUrl(currentProvider),
    };

    // Save to legacy config
    settings.setProviderConfig(
      currentProvider as "zai" | "minimax",
      finalConfig.apiKey!,
      finalConfig.baseUrl
    );

    // Save to V2 config
    accountsConfig.addAccount(
      currentProvider,
      currentProvider as "zai" | "minimax",
      finalConfig.apiKey!,
      finalConfig.baseUrl
    );

    addMessage(
      "success",
      `${currentProvider.toUpperCase()} configured successfully!`
    );
    setCompletedProviders((prev) => [...prev, currentProvider]);
    moveToNextProvider();
  };

  const moveToNextProvider = () => {
    const nextIndex = currentProviderIndex + 1;
    if (nextIndex < selectedProviders.length) {
      setCurrentProviderIndex(nextIndex);
      setCurrentSetup({});
      addMessage(
        "info",
        `Configuring ${selectedProviders[nextIndex].toUpperCase()}...`
      );
      setStep("enter-api-key");
    } else {
      setStep("confirm-hooks");
    }
  };

  const handleConfirmHooks = (confirm: boolean) => {
    if (confirm) {
      setStep("setup-hooks");
      installHooks();
    } else {
      setStep("done");
      setTimeout(() => exit(), 500);
    }
  };

  const installHooks = async () => {
    try {
      const claudeSettingsPath = path.join(os.homedir(), ".claude");
      const settingsFilePath = path.join(claudeSettingsPath, "settings.json");
      const hookCommand = "relay auto hook --silent";
      const stopCommand = "relay hooks stop";

      // Read or create settings
      let settingsData: any = {};
      if (fs.existsSync(settingsFilePath)) {
        try {
          const content = fs.readFileSync(settingsFilePath, "utf-8");
          settingsData = JSON.parse(content);
        } catch {
          settingsData = {};
        }
      }

      // Initialize hooks
      if (!settingsData.hooks) {
        settingsData.hooks = {};
      }

      // Add SessionStart hook
      if (!settingsData.hooks.SessionStart) {
        settingsData.hooks.SessionStart = [];
      }

      const sessionStartExists = settingsData.hooks.SessionStart.some(
        (h: any) =>
          h.type === "command" &&
          h.command &&
          (h.command === hookCommand || h.command.includes("auto hook"))
      );

      if (!sessionStartExists) {
        settingsData.hooks.SessionStart.push({
          matcher: "startup|resume|clear|compact",
          hooks: [{ type: "command", command: hookCommand }],
        });
      }

      // Add Stop hook
      if (!settingsData.hooks.Stop) {
        settingsData.hooks.Stop = [];
      }

      const stopExists = (settingsData.hooks.Stop || []).some(
        (h: any) =>
          h.hooks &&
          h.hooks.some(
            (hook: any) =>
              hook.type === "command" &&
              (hook.command === stopCommand ||
                hook.command?.includes("hooks stop"))
          )
      );

      if (!stopExists) {
        settingsData.hooks.Stop.push({
          hooks: [{ type: "command", command: stopCommand }],
        });
      }

      // Set environment variables
      if (!settingsData.env) {
        settingsData.env = {};
      }
      Object.assign(settingsData.env, {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
        ENABLE_BACKGROUND_TASKS: "1",
        FORCE_AUTO_BACKGROUND_TASKS: "1",
        CLAUDE_CODE_ENABLE_UNIFIED_READ_TOOL: "1",
        DISABLE_TELEMETRY: "1",
        DISABLE_ERROR_REPORTING: "1",
      });

      const containerEnvVars = getContainerEnvVars();
      Object.assign(settingsData.env, containerEnvVars);

      fs.writeFileSync(settingsFilePath, JSON.stringify(settingsData, null, 2));
      setHooksInstalled(true);
      addMessage("success", "Hooks installed successfully!");
    } catch (error: any) {
      addMessage("warning", `Failed to install hooks: ${error.message}`);
    }

    setStep("done");
    setTimeout(() => exit(), 500);
  };

  const config = loadConfig();

  return (
    <Section title="relay First-Run Setup">
      <Box flexDirection="column">
        {/* Messages */}
        {messages.map((msg, i) => (
          <Box key={`${msg.text}-${i}`}>
            {msg.type === "info" && <Info>{msg.text}</Info>}
            {msg.type === "success" && <Success>{msg.text}</Success>}
            {msg.type === "warning" && <Warning>{msg.text}</Warning>}
          </Box>
        ))}

        {/* Welcome Step */}
        {step === "welcome" && (
          <Box flexDirection="column" marginTop={1}>
            {existingProviders.length > 0 ? (
              <>
                <Text>Welcome back! Your relay configuration was found.</Text>
                <Box marginTop={1}>
                  <Text color="gray">
                    Already configured:{" "}
                    {existingProviders.map((p) => p.toUpperCase()).join(", ")}
                  </Text>
                </Box>
                <Box marginTop={1}>
                  <Text color="gray">
                    You can modify existing providers or add new ones.
                  </Text>
                </Box>
              </>
            ) : (
              <>
                <Text>Welcome to relay! Let's get you set up.</Text>
                <Box marginTop={1}>
                  <Text color="gray">
                    This wizard will help you configure your API providers and
                    set up Claude Code hooks.
                  </Text>
                </Box>
              </>
            )}
            <Box marginTop={1}>
              <Text>Continue? </Text>
              <ConfirmInput
                defaultChoice="confirm"
                onCancel={() => {
                  addMessage("info", "Setup cancelled.");
                  setTimeout(() => exit(), 500);
                }}
                onConfirm={handleWelcomeConfirm}
              />
            </Box>
          </Box>
        )}

        {/* Select Providers */}
        {step === "select-providers" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Select API providers to configure:</Text>
            {existingProviders.length > 0 && (
              <Box marginTop={1}>
                <Text color="green">
                  Already configured:{" "}
                  {existingProviders.map((p) => p.toUpperCase()).join(", ")}
                </Text>
              </Box>
            )}
            <Box paddingLeft={2}>
              <CustomMultiSelect
                defaultValue={existingProviders}
                onSubmit={handleProvidersSelected}
                options={PROVIDERS}
              />
            </Box>
            <Box marginTop={1}>
              <Text color="gray">
                You can configure multiple providers and use auto-rotation.
              </Text>
            </Box>
          </Box>
        )}

        {/* Enter API Key */}
        {step === "enter-api-key" && (
          <Box marginTop={1}>
            <Text>Enter API Key for {currentProvider}: </Text>
            <PasswordInput
              onSubmit={handleApiKeySubmit}
              placeholder="Enter API key..."
            />
          </Box>
        )}

        {/* Enter Base URL */}
        {step === "enter-base-url" && (
          <Box marginTop={1}>
            <Text>Base URL: </Text>
            <TextInput
              defaultValue={getDefaultBaseUrl(currentProvider)}
              onSubmit={handleBaseUrlSubmit}
            />
          </Box>
        )}

        {/* Confirm Hooks */}
        {step === "confirm-hooks" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Configure Claude Code hooks?</Text>
            <Box marginTop={1}>
              <Info>This will enable:</Info>
            </Box>
            <Box marginLeft={2}>
              <Text>• Auto-rotation of API keys on session start</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>• Commit prompt on session end</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>• Z.AI plugin installation (for Z.AI provider)</Text>
            </Box>
            <Box marginTop={1}>
              <Text>Install hooks? </Text>
              <ConfirmInput
                defaultChoice="confirm"
                onCancel={() => {
                  addMessage("info", "Skipped hooks installation.");
                  setStep("done");
                  setTimeout(() => exit(), 500);
                }}
                onConfirm={() => handleConfirmHooks(true)}
              />
            </Box>
          </Box>
        )}

        {/* Setup Hooks */}
        {step === "setup-hooks" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Installing hooks...</Text>
          </Box>
        )}

        {/* Done */}
        {step === "done" && (
          <Box flexDirection="column" marginTop={1}>
            <Success>Setup complete!</Success>
            <Box marginTop={1}>
              <Text bold>What was configured:</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>
                • Providers:{" "}
                {completedProviders.map((p) => p.toUpperCase()).join(", ") ||
                  "None"}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text>• Hooks: {hooksInstalled ? "Installed" : "Skipped"}</Text>
            </Box>
            {completedProviders.length > 0 && (
              <>
                <Box marginTop={1}>
                  <Text bold>Next steps:</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text>• Run "relay status" to check configuration</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text>• Run "relay auto enable" to enable rotation</Text>
                </Box>
                <Box marginLeft={2}>
                  <Text>• Run "relay hooks status" to verify hooks</Text>
                </Box>
              </>
            )}
          </Box>
        )}
      </Box>
    </Section>
  );
}

function getDefaultBaseUrl(provider: string): string {
  const configs: Record<string, string> = {
    zai: "https://openapi.zhi.ai",
    minimax: "https://api.minimax.chat/v1",
  };
  return configs[provider] || "";
}
