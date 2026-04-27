import { Args } from "@oclif/core";
import { Box, Text } from "ink";
import type { AccountConfig } from "../../config/accounts-config";
import { listAccounts, switchAccount } from "../../config/accounts-config";
import { isRelayProvider } from "../../config/provider-metadata";
import * as settings from "../../config/settings";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Success } from "../../ui/index";

interface ResolutionResult {
  account: AccountConfig | null;
  matches: AccountConfig[];
}

function pickSingleMatch(matches: AccountConfig[]): AccountConfig | null {
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function resolveAccountReference(reference: string): ResolutionResult {
  const accounts = listAccounts();
  const normalizedReference = reference.trim().toLowerCase();

  const exactId = accounts.find((account) => account.id === reference);
  if (exactId) {
    return { account: exactId, matches: [exactId] };
  }

  const nameMatches = accounts.filter(
    (account) => account.name.trim().toLowerCase() === normalizedReference,
  );
  const matchedByName = pickSingleMatch(nameMatches);
  if (matchedByName) {
    return { account: matchedByName, matches: nameMatches };
  }
  if (nameMatches.length > 1) {
    return { account: null, matches: nameMatches };
  }

  if (isRelayProvider(normalizedReference)) {
    const providerMatches = accounts.filter((account) => account.provider === normalizedReference);
    const matchedByProvider = pickSingleMatch(providerMatches);
    if (matchedByProvider) {
      return { account: matchedByProvider, matches: providerMatches };
    }
    if (providerMatches.length > 1) {
      return { account: null, matches: providerMatches };
    }
  }

  return { account: null, matches: [] };
}

export default class AccountSwitch extends BaseCommand<typeof AccountSwitch> {
  static description = "Switch to an account";
  static examples = [
    "<%= config.bin %> account switch acc_123456",
    "<%= config.bin %> account switch minimax",
    "<%= config.bin %> account switch zai-prod",
  ];

  static args = {
    reference: Args.string({
      description: "Account ID, account name, or provider name",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const reference = this.args.reference;
    const resolution = resolveAccountReference(reference);

    if (resolution.account && switchAccount(resolution.account.id)) {
      settings.setActiveProvider(resolution.account.provider);
      settings.setProviderConfig(
        resolution.account.provider,
        resolution.account.apiKey,
        resolution.account.baseUrl,
      );

      await this.renderApp(
        <Box flexDirection="column">
          <Success>
            Switched to account {resolution.account.name} ({resolution.account.provider})
          </Success>
          <Info>Account ID: {resolution.account.id}</Info>
        </Box>,
      );
      return;
    }

    if (resolution.matches.length > 1) {
      await this.renderApp(
        <Box flexDirection="column">
          <ErrorBadge>
            Account reference "{reference}" is ambiguous. Use an account ID instead.
          </ErrorBadge>
          {resolution.matches.map((account) => (
            <Text key={account.id}>
              • {account.name} ({account.provider}) — {account.id}
            </Text>
          ))}
        </Box>,
      );
      return;
    }

    await this.renderApp(
      <Box>
        <ErrorBadge>Account "{reference}" not found.</ErrorBadge>
      </Box>,
    );
  }
}
