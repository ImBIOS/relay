import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ConfirmInput, PasswordInput, TextInput } from "@inkjs/ui";
import { Flags } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import type React from "react";
import { useState } from "react";
import {
  addAccount,
  getActiveAccount,
  loadConfig,
  switchAccount,
  updateAccount,
  type AccountConfig,
} from "../config/accounts-config";
import {
  getDefaultBaseUrl,
  getProviderDisplayName,
  getProviderCliLabel,
  isRelayProvider,
  listRelayProviders,
  type RelayProvider,
} from "../config/provider-metadata";
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

const PROVIDERS = listRelayProviders().map((provider) => ({
  label: getProviderCliLabel(provider),
  value: provider,
}));

interface ProviderSetup {
  provider: RelayProvider;
  apiKey: string;
  baseUrl: string;
  groupId?: string;
}

interface NonInteractiveFirstRunFlags {
  providers?: string;
  zaiApiKey?: string;
  zaiBaseUrl?: string;
  minimaxApiKey?: string;
  minimaxBaseUrl?: string;
  minimaxGroupId?: string;
  installHooks: boolean;
}

function isRawModeSupported(): boolean {
  const stdin = process.stdin as { isRawModeSupported?: boolean };
  return (
    typeof stdin.isRawModeSupported === "boolean" && stdin.isRawModeSupported
  );
}

function getConfiguredProviders(): RelayProvider[] {
  const config = loadConfig();
  return [
    ...new Set(
      Object.values(config.accounts)
        .map((account) => account.provider)
        .filter(isRelayProvider)
    ),
  ];
}

function findProviderAccount(provider: RelayProvider): AccountConfig | null {
  const accounts = Object.values(loadConfig().accounts);
  return (
    accounts.find((account) => account.provider === provider && account.name === provider) ??
    accounts.find((account) => account.provider === provider) ??
    null
  );
}

function isProviderConfigured(provider: RelayProvider): boolean {
  return Boolean(findProviderAccount(provider)?.apiKey);
}

function upsertProviderAccount(
  setup: ProviderSetup,
  activate: boolean
): { account: AccountConfig; action: "created" | "updated" } {
  const existingAccount = findProviderAccount(setup.provider);

  if (existingAccount) {
    const updated = updateAccount(existingAccount.id, {
      apiKey: setup.apiKey,
      baseUrl: setup.baseUrl,
      groupId: setup.groupId,
      isActive: true,
    });

    if (!updated) {
      throw new Error(`Failed to update ${setup.provider} account.`);
    }

    settings.setProviderConfig(setup.provider, updated.apiKey, updated.baseUrl);
    if (activate) {
      switchAccount(updated.id);
      settings.setActiveProvider(updated.provider);
    }

    return { account: updated, action: "updated" };
  }

  const created = addAccount(
    setup.provider,
    setup.provider,
    setup.apiKey,
    setup.baseUrl,
    setup.groupId
  );

  settings.setProviderConfig(setup.provider, created.apiKey, created.baseUrl);
  if (activate) {
    switchAccount(created.id);
    settings.setActiveProvider(created.provider);
  }

  return { account: created, action: "created" };
}

function installClaudeHooks(): { installed: boolean; message: string } {
  try {
    const homeDir = process.env.HOME || os.homedir();
    const claudeSettingsPath = path.join(homeDir, ".claude");
    const settingsFilePath = path.join(claudeSettingsPath, "settings.json");
    const hookCommand = "relay hooks session-start --silent";
    const stopCommand = "relay hooks stop";

    fs.mkdirSync(claudeSettingsPath, { recursive: true });

    let settingsData: Record<string, any> = {};
    if (fs.existsSync(settingsFilePath)) {
      try {
        const content = fs.readFileSync(settingsFilePath, "utf-8");
        const parsed = JSON.parse(content) as Record<string, any>;
        settingsData = typeof parsed === "object" && parsed !== null ? parsed : {};
      } catch {
        settingsData = {};
      }
    }

    if (!settingsData.hooks || typeof settingsData.hooks !== "object") {
      settingsData.hooks = {};
    }

    if (!Array.isArray(settingsData.hooks.SessionStart)) {
      settingsData.hooks.SessionStart = [];
    }

    const sessionStartExists = settingsData.hooks.SessionStart.some(
      (hookGroup: any) =>
        Array.isArray(hookGroup?.hooks) &&
        hookGroup.hooks.some(
          (hook: any) =>
            hook?.type === "command" &&
            typeof hook?.command === "string" &&
          (hook.command === hookCommand ||
            hook.command.includes("hooks session-start") ||
            hook.command.includes("auto hook"))
        )
    );

    if (!sessionStartExists) {
      settingsData.hooks.SessionStart.push({
        matcher: "startup|resume|clear|compact",
        hooks: [{ type: "command", command: hookCommand }],
      });
    }

    if (!Array.isArray(settingsData.hooks.Stop)) {
      settingsData.hooks.Stop = [];
    }

    const stopExists = settingsData.hooks.Stop.some(
      (hookGroup: any) =>
        Array.isArray(hookGroup?.hooks) &&
        hookGroup.hooks.some(
          (hook: any) =>
            hook?.type === "command" &&
            typeof hook?.command === "string" &&
            (hook.command === stopCommand || hook.command.includes("hooks stop"))
        )
    );

    if (!stopExists) {
      settingsData.hooks.Stop.push({
        hooks: [{ type: "command", command: stopCommand }],
      });
    }

    if (!settingsData.env || typeof settingsData.env !== "object") {
      settingsData.env = {};
    }

    Object.assign(settingsData.env, {
      ANTHROPIC_AUTH_TOKEN: "relay",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:8787/api/anthropic",
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "glm-5.1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "glm-5-turbo",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "MiniMax-M2.7",
      DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
      ENABLE_BACKGROUND_TASKS: "1",
      FORCE_AUTO_BACKGROUND_TASKS: "1",
      CLAUDE_CODE_ENABLE_UNIFIED_READ_TOOL: "1",
      DISABLE_TELEMETRY: "1",
      DISABLE_ERROR_REPORTING: "1",
    });

    Object.assign(settingsData.env, getContainerEnvVars());

    fs.writeFileSync(settingsFilePath, JSON.stringify(settingsData, null, 2));
    return {
      installed: true,
      message:
        "Hooks installed successfully. Claude SessionStart will auto-ensure the relay proxy.",
    };
  } catch (error) {
    return {
      installed: false,
      message:
        error instanceof Error
          ? `Failed to install hooks: ${error.message}`
          : "Failed to install hooks.",
    };
  }
}

function collectProviders(flags: NonInteractiveFirstRunFlags): RelayProvider[] {
  const providers = new Set<RelayProvider>();

  if (flags.providers) {
    for (const rawProvider of flags.providers.split(",").map((value) => value.trim())) {
      if (!rawProvider) {
        continue;
      }
      if (!isRelayProvider(rawProvider)) {
        throw new Error(
          `Unsupported provider \"${rawProvider}\". Use one of: ${listRelayProviders().join(", ")}.`
        );
      }
      providers.add(rawProvider);
    }
  }

  if (flags.zaiApiKey || flags.zaiBaseUrl) {
    providers.add("zai");
  }
  if (flags.minimaxApiKey || flags.minimaxBaseUrl || flags.minimaxGroupId) {
    providers.add("minimax");
  }

  return [...providers];
}

function hasNonInteractiveInput(flags: NonInteractiveFirstRunFlags): boolean {
  return Boolean(
    flags.providers ||
      flags.zaiApiKey ||
      flags.zaiBaseUrl ||
      flags.minimaxApiKey ||
      flags.minimaxBaseUrl ||
      flags.minimaxGroupId ||
      flags.installHooks
  );
}

async function runNonInteractiveFirstRun(
  flags: NonInteractiveFirstRunFlags
): Promise<void> {
  const providers = collectProviders(flags);

  if (providers.length === 0) {
    throw new Error(
      "Non-interactive onboarding requires --providers or provider-specific flags."
    );
  }

  const summary: string[] = [];
  let activated = false;

  for (const provider of providers) {
    const existingAccount = findProviderAccount(provider);
    const apiKey = provider === "zai" ? flags.zaiApiKey : flags.minimaxApiKey;
    const baseUrl =
      provider === "zai"
        ? flags.zaiBaseUrl || existingAccount?.baseUrl || getDefaultBaseUrl("zai")
        : flags.minimaxBaseUrl ||
          existingAccount?.baseUrl ||
          getDefaultBaseUrl("minimax");
    const groupId =
      provider === "minimax"
        ? flags.minimaxGroupId || existingAccount?.groupId
        : undefined;

    if (!apiKey) {
      if (!existingAccount) {
        throw new Error(
          `Missing API key for ${provider}. Provide ${provider === "zai" ? "--zai-api-key" : "--minimax-api-key"}.`
        );
      }

      settings.setProviderConfig(provider, existingAccount.apiKey, existingAccount.baseUrl);
      if (!activated) {
        switchAccount(existingAccount.id);
        settings.setActiveProvider(existingAccount.provider);
        activated = true;
      }
      summary.push(
        `Reused existing ${getProviderDisplayName(provider)} account ${existingAccount.name} (${existingAccount.id}).`
      );
      continue;
    }

    const { account, action } = upsertProviderAccount(
      {
        provider,
        apiKey,
        baseUrl,
        groupId,
      },
      !activated
    );

    if (!activated) {
      activated = true;
    }

    summary.push(
      `${action === "created" ? "Added" : "Updated"} ${getProviderDisplayName(provider)} account ${account.name} (${account.id}).`
    );
  }

  console.log("relay onboarding complete.");
  for (const line of summary) {
    console.log(`- ${line}`);
  }

  if (flags.installHooks) {
    const hookResult = installClaudeHooks();
    console.log(`- ${hookResult.message}`);
  } else {
    console.log(
      "- Hooks skipped. Re-run with --install-hooks to auto-start relay during Claude SessionStart.",
    );
  }

  console.log("Next steps:");
  console.log("- relay status");
  if (flags.installHooks) {
    console.log("- claude -p \"Reply with exactly RELAY_OK\"");
  } else {
    console.log("- relay proxy start");
  }
}

export default class FirstRun extends BaseCommand<typeof FirstRun> {
  static description = "First-time setup wizard for relay";
  static aliases = ["init"];
  static examples = [
    "<%= config.bin %> first-run",
    "<%= config.bin %> init",
    "<%= config.bin %> init --providers zai,minimax --zai-api-key sk-xxx --minimax-api-key mmkey-xxx --install-hooks",
  ];

  static flags = {
    providers: Flags.string({
      description:
        "Comma-separated providers to configure non-interactively (zai,minimax)",
    }),
    "zai-api-key": Flags.string({ description: "Z.AI API key" }),
    "zai-base-url": Flags.string({ description: "Override Z.AI base URL" }),
    "minimax-api-key": Flags.string({ description: "MiniMax API key" }),
    "minimax-base-url": Flags.string({ description: "Override MiniMax base URL" }),
    "minimax-group-id": Flags.string({
      description: "MiniMax GroupId for usage tracking (optional)",
    }),
    "install-hooks": Flags.boolean({
      description: "Install Claude Code hooks after configuring providers",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(FirstRun);
    const nonInteractiveFlags: NonInteractiveFirstRunFlags = {
      providers: flags.providers,
      zaiApiKey: flags["zai-api-key"],
      zaiBaseUrl: flags["zai-base-url"],
      minimaxApiKey: flags["minimax-api-key"],
      minimaxBaseUrl: flags["minimax-base-url"],
      minimaxGroupId: flags["minimax-group-id"],
      installHooks: flags["install-hooks"],
    };

    if (hasNonInteractiveInput(nonInteractiveFlags)) {
      await runNonInteractiveFirstRun(nonInteractiveFlags);
      return;
    }

    if (!isRawModeSupported()) {
      await this.renderApp(
        <Section title="relay First-Run Setup">
          <Box flexDirection="column">
            <Warning>
              Interactive onboarding requires a TTY-enabled terminal.
            </Warning>
            <Info>
              Use non-interactive onboarding in containers and CI, for example:
            </Info>
            <Info>
              relay init --providers zai,minimax --zai-api-key sk-xxx --minimax-api-key mmkey-xxx --install-hooks
            </Info>
          </Box>
        </Section>
      );
      return;
    }

    await this.renderApp(<FirstRunUI />);
  }
}

type Step =
  | "welcome"
  | "select-providers"
  | "enter-api-key"
  | "enter-base-url"
  | "confirm-hooks"
  | "setup-hooks"
  | "done";

function FirstRunUI(): React.ReactElement {
  const { exit } = useApp();
  const configuredProviders = getConfiguredProviders();
  const [step, setStep] = useState<Step>("welcome");
  const [selectedProviders, setSelectedProviders] = useState<RelayProvider[]>(
    configuredProviders
  );
  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
  const [currentSetup, setCurrentSetup] = useState<Partial<ProviderSetup>>({});
  const [completedProviders, setCompletedProviders] = useState<RelayProvider[]>(
    configuredProviders
  );
  const [hooksInstalled, setHooksInstalled] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ type: "info" | "success" | "warning"; text: string }>
  >([]);

  const currentProvider = selectedProviders[currentProviderIndex] ?? null;

  const addMessage = (type: "info" | "success" | "warning", text: string) => {
    setMessages((prev) => [...prev, { type, text }]);
  };

  const moveToNextProvider = () => {
    const nextIndex = currentProviderIndex + 1;
    if (nextIndex < selectedProviders.length) {
      const nextProvider = selectedProviders[nextIndex];
      if (!nextProvider) {
        setStep("confirm-hooks");
        return;
      }
      setCurrentProviderIndex(nextIndex);
      setCurrentSetup({});
      addMessage("info", `Configuring ${nextProvider.toUpperCase()}...`);
      setStep("enter-api-key");
      return;
    }

    setStep("confirm-hooks");
  };

  const handleProvidersSelected = (providers: string[]) => {
    const validProviders = providers.filter(isRelayProvider);
    if (validProviders.length === 0) {
      addMessage("warning", "No providers selected.");
      return;
    }

    setSelectedProviders(validProviders);
    setCurrentProviderIndex(0);
    setCurrentSetup({});

    const allConfigured = validProviders.every((provider) =>
      isProviderConfigured(provider)
    );

    if (allConfigured) {
      addMessage("info", "All selected providers already configured.");
      setCompletedProviders(validProviders);
      setStep("confirm-hooks");
      return;
    }

    const firstProvider = validProviders[0];
    if (!firstProvider) {
      addMessage("warning", "No providers selected.");
      return;
    }

    if (isProviderConfigured(firstProvider)) {
      addMessage("info", `${firstProvider.toUpperCase()} already configured.`);
      moveToNextProvider();
      return;
    }

    addMessage("info", `Configuring ${firstProvider.toUpperCase()}...`);
    setStep("enter-api-key");
  };

  const handleApiKeySubmit = (apiKey: string) => {
    if (!currentProvider) {
      addMessage("warning", "No provider selected.");
      return;
    }

    if (isProviderConfigured(currentProvider)) {
      addMessage("info", `${currentProvider.toUpperCase()} already configured.`);
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

    setCurrentSetup({
      provider: currentProvider,
      apiKey,
      groupId: currentSetup.groupId,
    });
    setStep(currentProvider === "minimax" ? "enter-base-url" : "enter-base-url");
  };

  const handleBaseUrlSubmit = (baseUrl: string) => {
    if (!currentProvider || !currentSetup.apiKey) {
      addMessage("warning", "Provider setup is incomplete.");
      moveToNextProvider();
      return;
    }

    const shouldActivate = !getActiveAccount() && currentProviderIndex === 0;
    const result = upsertProviderAccount(
      {
        provider: currentProvider,
        apiKey: currentSetup.apiKey,
        baseUrl: baseUrl || getDefaultBaseUrl(currentProvider),
        groupId: currentSetup.groupId,
      },
      shouldActivate
    );

    addMessage(
      "success",
      `${currentProvider.toUpperCase()} ${result.action === "created" ? "configured" : "updated"} successfully!`
    );
    setCompletedProviders((prev) =>
      prev.includes(currentProvider) ? prev : [...prev, currentProvider]
    );
    moveToNextProvider();
  };

  const handleConfirmHooks = (confirm: boolean) => {
    if (confirm) {
      setStep("setup-hooks");
      const result = installClaudeHooks();
      setHooksInstalled(result.installed);
      addMessage(result.installed ? "success" : "warning", result.message);
      setStep("done");
      setTimeout(() => exit(), 500);
      return;
    }

    addMessage("info", "Skipped hooks installation.");
    setStep("done");
    setTimeout(() => exit(), 500);
  };

  return (
    <Section title="relay First-Run Setup">
      <Box flexDirection="column">
        {messages.map((msg, i) => (
          <Box key={`${msg.text}-${i}`}>
            {msg.type === "info" && <Info>{msg.text}</Info>}
            {msg.type === "success" && <Success>{msg.text}</Success>}
            {msg.type === "warning" && <Warning>{msg.text}</Warning>}
          </Box>
        ))}

        {step === "welcome" && (
          <Box flexDirection="column" marginTop={1}>
            {configuredProviders.length > 0 ? (
              <>
                <Text>Welcome back! Your relay configuration was found.</Text>
                <Box marginTop={1}>
                  <Text color="gray">
                    Already configured:{" "}
                    {configuredProviders.map((provider) => provider.toUpperCase()).join(", ")}
                  </Text>
                </Box>
                <Box marginTop={1}>
                  <Text color="gray">
                    You can add missing providers or keep your current setup.
                  </Text>
                </Box>
              </>
            ) : (
              <>
                <Text>Welcome to relay! Let&apos;s get you set up.</Text>
                <Box marginTop={1}>
                  <Text color="gray">
                    This wizard configures your providers and can update Claude Code hooks.
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
                onConfirm={() => setStep("select-providers")}
              />
            </Box>
          </Box>
        )}

        {step === "select-providers" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Select API providers to configure:</Text>
            {configuredProviders.length > 0 && (
              <Box marginTop={1}>
                <Text color="green">
                  Already configured:{" "}
                  {configuredProviders.map((provider) => provider.toUpperCase()).join(", ")}
                </Text>
              </Box>
            )}
            <Box paddingLeft={2}>
              <CustomMultiSelect
                defaultValue={configuredProviders}
                onSubmit={handleProvidersSelected}
                options={PROVIDERS}
              />
            </Box>
            <Box marginTop={1}>
              <Text color="gray">
                You can configure multiple providers and use the proxy for hot-switching.
              </Text>
            </Box>
          </Box>
        )}

        {step === "enter-api-key" && currentProvider && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Enter API Key for {currentProvider}: </Text>
            <PasswordInput
              onSubmit={handleApiKeySubmit}
              placeholder="Enter API key..."
            />
            {currentProvider === "minimax" && (
              <Box marginTop={1}>
                <Text color="gray">
                  MiniMax GroupId is optional here. Add it later with "relay account edit"
                  if you want detailed usage tracking.
                </Text>
              </Box>
            )}
          </Box>
        )}

        {step === "enter-base-url" && currentProvider && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Base URL for {getProviderDisplayName(currentProvider)}: </Text>
            <TextInput
              defaultValue={getDefaultBaseUrl(currentProvider)}
              onSubmit={handleBaseUrlSubmit}
            />
            <Box marginTop={1}>
              <Text color="gray">
                Press Enter to keep the recommended default.
              </Text>
            </Box>
          </Box>
        )}

        {step === "confirm-hooks" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Configure Claude Code hooks?</Text>
            <Box marginTop={1}>
              <Info>This will enable:</Info>
            </Box>
            <Box marginLeft={2}>
              <Text>• Automatic SessionStart provider rotation + proxy auto-ensure</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>• Relay hook wiring inside ~/.claude/settings.json</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>• Claude Code proxy env at http://127.0.0.1:8787/api/anthropic</Text>
            </Box>
            <Box marginTop={1}>
              <Text>Install hooks? </Text>
              <ConfirmInput
                defaultChoice="confirm"
                onCancel={() => handleConfirmHooks(false)}
                onConfirm={() => handleConfirmHooks(true)}
              />
            </Box>
          </Box>
        )}

        {step === "setup-hooks" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Installing hooks...</Text>
          </Box>
        )}

        {step === "done" && (
          <Box flexDirection="column" marginTop={1}>
            <Success>Setup complete!</Success>
            <Box marginTop={1}>
              <Text bold>What was configured:</Text>
            </Box>
            <Box marginLeft={2}>
              <Text>
                • Providers:{" "}
                {completedProviders.map((provider) => provider.toUpperCase()).join(", ") ||
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
                  <Text>• Run "relay status" to verify the active account</Text>
                </Box>
                {hooksInstalled ? (
                  <Box marginLeft={2}>
                    <Text>• Run "claude -p \"Reply with exactly RELAY_OK\""</Text>
                  </Box>
                ) : (
                  <>
                    <Box marginLeft={2}>
                      <Text>• Run "relay proxy start" to launch the local proxy</Text>
                    </Box>
                    <Box marginLeft={2}>
                      <Text>
                        • Point Claude Code at http://127.0.0.1:8787/api/anthropic
                      </Text>
                    </Box>
                  </>
                )}
              </>
            )}
          </Box>
        )}
      </Box>
    </Section>
  );
}
