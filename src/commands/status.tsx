import { Box } from "ink";
import type React from "react";
import * as accountsConfig from "../config/accounts-config";
import { getProviderDisplayName } from "../config/provider-metadata";
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

function getProviderFactory(provider: string): (() => Provider) | null {
  return PROVIDERS[provider] ?? null;
}

export default class Status extends BaseCommand<typeof Status> {
  static description = "Show current provider and status";
  static examples = ["<%= config.bin %> status"];

  async run(): Promise<void> {
    const activeAccount = accountsConfig.getActiveAccount();
    const activeProviderKey = activeAccount?.provider ?? settings.getActiveProvider();
    const providerFactory = getProviderFactory(activeProviderKey);

    if (!providerFactory) {
      throw new Error(`Unsupported active provider \"${activeProviderKey}\".`);
    }

    const provider = providerFactory();
    const providerConfig = activeAccount
      ? {
          apiKey: activeAccount.apiKey,
          baseUrl: activeAccount.baseUrl,
        }
      : provider.getConfig();
    const hasApiKey = Boolean(providerConfig.apiKey);

    // Other provider status
    const otherProviderKey = activeProviderKey === "zai" ? "minimax" : "zai";
    const otherProviderFactory = getProviderFactory(otherProviderKey);

    if (!otherProviderFactory) {
      throw new Error(`Unsupported provider \"${otherProviderKey}\".`);
    }

    const otherProvider = otherProviderFactory();
    const otherConfig = otherProvider.getConfig();
    const otherHasAccount = accountsConfig
      .listAccounts()
      .some((account) => account.provider === otherProviderKey && account.isActive);
    const otherHasKey = otherHasAccount || Boolean(otherConfig.apiKey);

    // Profile info
    const activeProfile = profiles.getActiveProfile();

    // v2 account info
    const v2Config = accountsConfig.loadConfig();

    await this.renderApp(
      <StatusUI
        activeAccount={activeAccount}
        activeProfile={activeProfile?.name}
        activeProvider={
          activeAccount
            ? `${getProviderDisplayName(activeAccount.provider)} via ${activeAccount.name}`
            : provider.displayName
        }
        apiKey={hasApiKey ? `••••••••${providerConfig.apiKey.slice(-4)}` : "Not configured"}
        baseUrl={providerConfig.baseUrl}
        connection={hasApiKey ? "Ready" : "Not configured"}
        otherConfigured={otherHasKey}
        otherProvider={otherProvider.displayName}
        rotationEnabled={v2Config.rotation.enabled}
        rotationStrategy={v2Config.rotation.strategy}
      />,
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
              <Info>Rotation: {rotationEnabled ? rotationStrategy : "disabled"}</Info>
            </Box>
          )}
        </Box>
      </Section>
    </Box>
  );
}
