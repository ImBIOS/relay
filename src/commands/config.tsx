import { ConfirmInput, MultiSelect, PasswordInput, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import { Info, Section, Success, Warning } from "../ui/index";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

const PROVIDER_OPTIONS = [
  { label: "Z.AI (zai)", value: "zai" },
  { label: "MiniMax (minimax)", value: "minimax" },
];

export default class Config extends BaseCommand<typeof Config> {
  static description = "Configure API providers (interactive)";
  static examples = ["<%= config.bin %> config"];

  async run(): Promise<void> {
    await this.renderApp(<ConfigUI />);
  }
}

type ConfigStep =
  | "select-providers"
  | "configure-provider"
  | "confirm-reconfigure"
  | "enter-api-key"
  | "enter-base-url"
  | "done";

interface ProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
}

function ConfigUI(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<ConfigStep>("select-providers");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [currentProviderIndex, setCurrentProviderIndex] = useState(0);
  const [currentConfig, setCurrentConfig] = useState<Partial<ProviderConfig>>({});
  const [messages, setMessages] = useState<
    Array<{ type: "info" | "success" | "warning"; text: string }>
  >([]);

  const currentProvider = selectedProviders[currentProviderIndex];

  const addMessage = (type: "info" | "success" | "warning", text: string) => {
    setMessages((prev) => [...prev, { type, text }]);
  };

  const handleProvidersSelected = (providers: string[]) => {
    if (providers.length === 0) {
      addMessage("warning", "No providers selected.");
      setTimeout(() => exit(), 500);
      return;
    }
    setSelectedProviders(providers);
    setCurrentProviderIndex(0);
    checkProviderConfig(providers[0]);
  };

  const checkProviderConfig = (provider: string) => {
    const existingConfig = settings.getProviderConfig(provider as "zai" | "minimax");
    if (existingConfig.apiKey) {
      setStep("confirm-reconfigure");
    } else {
      setStep("enter-api-key");
      addMessage("info", `Configuring ${provider.toUpperCase()} provider...`);
    }
  };

  const handleReconfigure = (reconfigure: boolean) => {
    if (reconfigure) {
      setStep("enter-api-key");
      addMessage("info", `Configuring ${currentProvider.toUpperCase()} provider...`);
    } else {
      addMessage("info", `Skipping ${currentProvider.toUpperCase()} - already configured.`);
      moveToNextProvider();
    }
  };

  const handleApiKeySubmit = (apiKey: string) => {
    if (!apiKey) {
      addMessage("warning", `Skipping ${currentProvider.toUpperCase()} - no API key provided.`);
      moveToNextProvider();
      return;
    }
    setCurrentConfig({ provider: currentProvider, apiKey });
    setStep("enter-base-url");
  };

  const handleBaseUrlSubmit = (baseUrl: string) => {
    const finalConfig = {
      ...currentConfig,
      baseUrl: baseUrl || PROVIDERS[currentProvider]().getConfig().baseUrl,
    };

    settings.setProviderConfig(
      currentProvider as "zai" | "minimax",
      finalConfig.apiKey!,
      finalConfig.baseUrl,
    );
    addMessage("success", `${currentProvider.toUpperCase()} configuration saved!`);
    moveToNextProvider();
  };

  const moveToNextProvider = () => {
    const nextIndex = currentProviderIndex + 1;
    if (nextIndex < selectedProviders.length) {
      setCurrentProviderIndex(nextIndex);
      setCurrentConfig({});
      checkProviderConfig(selectedProviders[nextIndex]);
    } else {
      setStep("done");
      setTimeout(() => exit(), 500);
    }
  };

  return (
    <Section title="ImBIOS Configuration">
      <Box flexDirection="column">
        {/* Show accumulated messages */}
        {messages.map((msg, i) => (
          <Box key={`${msg.text}-${i}`}>
            {msg.type === "info" && <Info>{msg.text}</Info>}
            {msg.type === "success" && <Success>{msg.text}</Success>}
            {msg.type === "warning" && <Warning>{msg.text}</Warning>}
          </Box>
        ))}

        {/* Current step UI */}
        {step === "select-providers" && (
          <Box flexDirection="column" marginTop={1}>
            <Text>Select API providers to configure:</Text>
            <Box paddingLeft={2}>
              <MultiSelect onSubmit={handleProvidersSelected} options={PROVIDER_OPTIONS} />
            </Box>
          </Box>
        )}

        {step === "confirm-reconfigure" && (
          <Box marginTop={1}>
            <Text>{currentProvider.toUpperCase()} is already configured. Reconfigure? </Text>
            <ConfirmInput
              defaultChoice="cancel"
              onCancel={() => handleReconfigure(false)}
              onConfirm={() => handleReconfigure(true)}
            />
          </Box>
        )}

        {step === "enter-api-key" && (
          <Box marginTop={1}>
            <Text>Enter API Key for {currentProvider}: </Text>
            <PasswordInput onSubmit={handleApiKeySubmit} placeholder="Enter API key..." />
          </Box>
        )}

        {step === "enter-base-url" && (
          <Box marginTop={1}>
            <Text>Base URL: </Text>
            <TextInput
              defaultValue={
                settings.getProviderConfig(currentProvider as "zai" | "minimax").baseUrl ||
                PROVIDERS[currentProvider]().getConfig().baseUrl
              }
              onSubmit={handleBaseUrlSubmit}
            />
          </Box>
        )}

        {step === "done" && (
          <Box marginTop={1}>
            <Success>Configuration complete!</Success>
          </Box>
        )}
      </Box>
    </Section>
  );
}
