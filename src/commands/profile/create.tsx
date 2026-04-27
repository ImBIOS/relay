import { PasswordInput, Select, TextInput } from "@inkjs/ui";
import { Box, Text, useApp } from "ink";
import { useState } from "react";
import * as profiles from "../../config/profiles";
import { BaseCommand } from "../../oclif/base";
import type { Provider } from "../../providers/base";
import { minimaxProvider } from "../../providers/minimax";
import { zaiProvider } from "../../providers/zai";
import { Error as ErrorBadge, Section, Success } from "../../ui/index";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

const PROVIDER_OPTIONS = [
  { label: "Z.AI (zai)", value: "zai" },
  { label: "MiniMax (minimax)", value: "minimax" },
];

export default class ProfileCreate extends BaseCommand<typeof ProfileCreate> {
  static description = "Create a new profile";
  static examples = ["<%= config.bin %> profile create"];

  async run(): Promise<void> {
    await this.renderApp(<ProfileCreateUI />);
  }
}

type CreateStep = "name" | "provider" | "api-key" | "base-url" | "done" | "error";

function ProfileCreateUI(): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<CreateStep>("name");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<"zai" | "minimax">("zai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState("");

  const handleNameSubmit = (value: string) => {
    if (!value) {
      setError("Profile name is required.");
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
    setStep("base-url");
  };

  const handleBaseUrlSubmit = (value: string) => {
    setBaseUrl(value || PROVIDERS[provider]().getConfig().baseUrl);
    profiles.createProfile(name, provider, apiKey, baseUrl);
    setStep("done");
    setTimeout(() => exit(), 500);
  };

  return (
    <Section title="Create Profile">
      <Box flexDirection="column">
        {step === "name" && (
          <Box>
            <Text>Profile name: </Text>
            <TextInput onSubmit={handleNameSubmit} placeholder="Enter profile name..." />
          </Box>
        )}

        {step === "provider" && (
          <Box flexDirection="column">
            <Text>Select provider:</Text>
            <Box paddingLeft={2}>
              <Select onChange={handleProviderChange} options={PROVIDER_OPTIONS} />
            </Box>
          </Box>
        )}

        {step === "api-key" && (
          <Box>
            <Text>API Key for {provider}: </Text>
            <PasswordInput onSubmit={handleApiKeySubmit} placeholder="Enter API key..." />
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

        {step === "done" && <Success>Profile "{name}" created successfully!</Success>}

        {step === "error" && <ErrorBadge>{error}</ErrorBadge>}
      </Box>
    </Section>
  );
}
