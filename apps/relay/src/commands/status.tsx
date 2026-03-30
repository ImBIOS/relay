import { Box } from "ink";
import type React from "react";
import * as accountsConfig from "../config/accounts-config";
import * as profiles from "../config/profiles";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import type { Provider } from "../providers/base";
import { minimaxProvider } from "../providers/minimax";
import { zaiProvider } from "../providers/zai";
import { Info, Section, Table } from "../ui/index";

const PROVIDERS: Record<string, () => Provider> = {
  zai: () => zaiProvider,
  minimax: () => minimaxProvider,
};

export default class Status extends BaseCommand<typeof Status> {
  static description = "Show current provider and status";
  static examples = ["<%= config.bin %> status"];

  async run(): Promise<void> {
    const activeProvider = settings.getActiveProvider();
    const provider = PROVIDERS[activeProvider]();
    const config = provider.getConfig();
    const hasApiKey = Boolean(config.apiKey);

    // Other provider status
    const otherProviderKey = activeProvider === "zai" ? "minimax" : "zai";
    const otherProvider = PROVIDERS[otherProviderKey]();
    const otherConfig = otherProvider.getConfig();
    const otherHasKey = Boolean(otherConfig.apiKey);

    // Profile info
    const activeProfile = profiles.getActiveProfile();

    // v2 account info
    const v2Config = accountsConfig.loadConfig();
    const activeAccount = accountsConfig.getActiveAccount();

    await this.renderApp(
      <StatusUI
        activeAccount={activeAccount}
        activeProfile={activeProfile?.name}
        activeProvider={provider.displayName}
        apiKey={
          hasApiKey ? `••••••••${config.apiKey.slice(-4)}` : "Not configured"
        }
        baseUrl={config.baseUrl}
        connection={hasApiKey ? "Ready" : "Not configured"}
        otherConfigured={otherHasKey}
        otherProvider={otherProvider.displayName}
        rotationEnabled={v2Config.rotation.enabled}
        rotationStrategy={v2Config.rotation.strategy}
      />
    );
  }
}

interface StatusUIProps {
  activeProvider: string;
  apiKey: string;
  baseUrl: string;
  connection: string;
  otherProvider: string;
  otherConfigured: boolean;
  activeProfile?: string;
  activeAccount?: { name: string; provider: string } | null;
  rotationEnabled: boolean;
  rotationStrategy: string;
}

function StatusUI({
  activeProvider,
  apiKey,
  baseUrl,
  connection,
  otherProvider,
  otherConfigured,
  activeProfile,
  activeAccount,
  rotationEnabled,
  rotationStrategy,
}: StatusUIProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Section title="ImBIOS Status">
        <Table
          data={{
            "Active Provider": activeProvider,
            "API Key": apiKey,
            "Base URL": baseUrl,
            Connection: connection,
          }}
        />

        <Box flexDirection="column" marginTop={1}>
          <Info>
            {otherProvider}: {otherConfigured ? "Configured" : "Not configured"}
          </Info>

          {activeProfile && (
            <Box marginTop={1}>
              <Info>Active Profile: {activeProfile}</Info>
            </Box>
          )}

          {activeAccount && (
            <Box flexDirection="column" marginTop={1}>
              <Info>
                Active Account: {activeAccount.name} ({activeAccount.provider})
              </Info>
              <Info>
                Rotation: {rotationEnabled ? rotationStrategy : "disabled"}
              </Info>
            </Box>
          )}
        </Box>
      </Section>
    </Box>
  );
}
