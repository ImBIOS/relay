import { Spinner } from "@inkjs/ui";
import { Box, useApp } from "ink";
import { useEffect, useState } from "react";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import { Error as ErrorBadge, Section, Success } from "../ui/index";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class Test extends BaseCommand<typeof Test> {
  static description = "Test API connection";
  static examples = ["<%= config.bin %> test"];

  async run(): Promise<void> {
    const activeProvider = settings.getActiveProvider();
    const provider = PROVIDERS[activeProvider]();
    const config = provider.getConfig();

    if (!config.apiKey) {
      await this.renderApp(
        <Section title="API Connection Test">
          <ErrorBadge>
            {provider.displayName} is not configured. Run "relay config" first.
          </ErrorBadge>
        </Section>
      );
      return;
    }

    await this.renderApp(
      <TestUI provider={provider} providerName={provider.displayName} />
    );
  }
}

interface TestUIProps {
  provider: Provider;
  providerName: string;
}

function TestUI({ provider, providerName }: TestUIProps): React.ReactElement {
  const { exit } = useApp();
  const [testing, setTesting] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const runTest = async () => {
      const connected = await provider.testConnection();
      setSuccess(connected);
      setTesting(false);
      // Exit after a short delay to show the result
      setTimeout(() => exit(), 500);
    };
    runTest();
  }, [provider, exit]);

  return (
    <Section title="API Connection Test">
      <Box flexDirection="column">
        {testing ? (
          <Box>
            <Spinner label={`Testing ${providerName} connection...`} />
          </Box>
        ) : success ? (
          <Success>Connection successful!</Success>
        ) : (
          <ErrorBadge>
            Connection failed. Please check your API key and base URL.
          </ErrorBadge>
        )}
      </Box>
    </Section>
  );
}
