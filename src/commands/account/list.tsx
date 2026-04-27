import { Box, Text } from "ink";
import type React from "react";
import { getActiveAccount, listAccounts } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Info, Section } from "../../ui/index";

export default class AccountList extends BaseCommand<typeof AccountList> {
  static description = "List all accounts";
  static examples = ["<%= config.bin %> account list"];

  async run(): Promise<void> {
    const accounts = listAccounts();
    const activeAccount = getActiveAccount();

    await this.renderApp(<AccountListUI accounts={accounts} activeAccount={activeAccount} />);
  }
}

interface AccountData {
  id: string;
  name: string;
  provider: string;
  isActive: boolean;
}

interface AccountListUIProps {
  accounts: AccountData[];
  activeAccount: AccountData | null;
}

function AccountListUI({ accounts, activeAccount }: AccountListUIProps): React.ReactElement {
  if (accounts.length === 0) {
    return (
      <Section title="Multi-Account Management">
        <Info>No accounts configured. Use 'relay account add' to add one.</Info>
      </Section>
    );
  }

  return (
    <Section title="Multi-Account Management">
      <Box flexDirection="column">
        {accounts.map((acc) => {
          const isActive = acc.id === activeAccount?.id;
          return (
            <Box key={acc.id}>
              <Text color={isActive ? "green" : undefined}>
                {isActive ? "●" : "○"} {acc.name} ({acc.provider}) -{" "}
                {acc.isActive ? "active" : "inactive"} - {acc.id}
              </Text>
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Info>Active account: {activeAccount?.name || "none"}</Info>
        </Box>
      </Box>
    </Section>
  );
}
