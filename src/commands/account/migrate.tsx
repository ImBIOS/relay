import { BaseCommand } from "../../oclif/base";
import { addAccount, listAccounts, switchAccount } from "../../config/accounts-config";
import * as settings from "../../config/settings";
import { divider, ok, success, dim, warn } from "../../utils/console";

/**
 * Migrates legacy top-level provider configs to the new accounts-based system.
 *
 * For GitHub Copilot, this is critical because the legacy copilot config only has
 * the session token (tid=...), but the new system needs BOTH the session token (for
 * proxying) AND an OAuth token (gho_...) for usage queries via copilot_internal/user.
 */
export default class AccountMigrate extends BaseCommand<typeof AccountMigrate> {
  static description = "Migrate legacy provider configs to accounts system";

  static examples = [
    "<%= config.bin %> account migrate",
    "<%= config.bin %> account migrate --provider copilot",
  ];

  async run(): Promise<void> {
    const legacy = settings.loadSettings();

    console.log("");
    console.log(dim("  Relay Account Migration"));
    console.log(divider("-", 50));
    console.log("");

    const needsMigration: string[] = [];
    const existingCopilot = listAccounts().find((a) => a.provider === "copilot");
    if (legacy.copilot?.apiKey && !existingCopilot) {
      needsMigration.push("copilot");
    }

    if (needsMigration.length === 0) {
      console.log(dim("  No legacy configs need migration."));
      console.log("");
      const copilotAcc = listAccounts().find((a) => a.provider === "copilot");
      if (copilotAcc) {
        console.log(dim("  Copilot account exists: ") + copilotAcc.name);
        if (!copilotAcc.oauthToken) {
          console.log(warn("  OAuth token missing - run 'relay account migrate --provider copilot' to add one"));
        } else {
          console.log(ok("  OAuth token stored"));
        }
      }
      console.log("");
      return;
    }

    console.log(dim("  Found legacy config(s) to migrate:"));
    for (const p of needsMigration) {
      console.log("    * " + p);
    }
    console.log("");

    for (const provider of needsMigration) {
      if (provider === "copilot") {
        await migrateCopilot(legacy);
      }
    }

    console.log("");
    console.log(success("  Migration complete!"));
    console.log(dim("  Run 'relay account list' to verify."));
    console.log("");
  }
}

async function migrateCopilot(legacy: ReturnType<typeof settings.loadSettings>): Promise<void> {
  const copilotConfig = legacy.copilot;
  if (!copilotConfig?.apiKey) return;

  console.log(divider("-", 50));
  console.log(dim("  Migrating GitHub Copilot"));
  console.log("");

  console.log(
    dim(
      "  The existing config only has the Copilot session token (tid=...).\n" +
        "  For usage queries (relay usage), we also need a GitHub PAT or OAuth token\n" +
        "  to call the copilot_internal/user API endpoint.",
    ),
  );
  console.log("");
  console.log(dim("  Get a fine-grained PAT from: https://github.com/settings/tokens?type=beta"));
  console.log(dim("  Required scope: 'Copilot Requests' (or 'copilot' for full access)"));
  console.log("");

  const envToken = process.env.GITHUB_COPILOT_TOKEN;

  if (envToken) {
    console.log(ok("  Found GITHUB_COPILOT_TOKEN in environment"));
    console.log("");
    await createCopilotAccount(copilotConfig.apiKey, envToken);
    return;
  }

  console.log(dim("  Please provide a GitHub token for usage queries."));
  console.log(dim("  You can set it as environment variable GITHUB_COPILOT_TOKEN"));
  console.log(dim("  and re-run this command:"));
  console.log("");
  console.log("    export GITHUB_COPILOT_TOKEN=\"github_pat_...\"");
  console.log("    relay account migrate --provider copilot");
  console.log("");
  console.log(dim("  Alternatively, use 'relay account login copilot' for interactive OAuth flow"));
  console.log("");
}

async function createCopilotAccount(sessionToken: string, oauthToken: string): Promise<void> {
  const name = "github-copilot";

  const account = addAccount({
    name,
    provider: "copilot",
    apiKey: sessionToken,
    oauthToken,
  });

  switchAccount(account.id);
  settings.setProviderConfig("copilot", { apiKey: sessionToken, baseUrl: "" });

  console.log(ok("  Copilot account created with OAuth token"));
  console.log("    Name: " + name);
  console.log("    Session token: " + sessionToken.substring(0, 30) + "...");
  console.log("    OAuth token: " + oauthToken.substring(0, 20) + "...");
  console.log("");
}