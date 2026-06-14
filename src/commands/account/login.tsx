import { BaseCommand } from "../../oclif/base";
import { completeDeviceFlow } from "../../utils/github-oauth";
import {
  addAccount,
  deduplicateAccounts,
  getActiveAccount,
  switchAccount,
  updateAccount,
  loadConfig,
} from "../../config/accounts-config";
import * as settings from "../../config/settings";
import { bold, cyan, dim, ok, success, warn } from "../../utils/console";
import { isValidEmail } from "../../utils/validate";
import { text, isCancel } from "@clack/prompts";
import {
  isCursorIdeInstalled,
  isCursorAgentInstalled,
  readCursorCliConfig,
  getCursorSessionToken,
  pkceBrowserLogin,
} from "../../utils/cursor-auth";

/**
 * Find an existing account by name and provider, or return null.
 */
function findAccount(name: string, provider: string): { id: string; apiKey: string } | null {
  const config = loadConfig();
  for (const [id, account] of Object.entries(config.accounts)) {
    if (account.name === name && account.provider === provider) {
      return { id, apiKey: account.apiKey };
    }
  }
  return null;
}

/**
 * Add or update an account. If an account with the same name+provider exists,
 * update its API key. Otherwise, create a new one.
 */
function upsertAccount(input: {
  name: string;
  provider: string;
  apiKey: string;
  oauthToken?: string;
}): { id: string; isNew: boolean } {
  const existing = findAccount(input.name, input.provider);
  if (existing) {
    updateAccount(existing.id, {
      apiKey: input.apiKey,
      ...(input.oauthToken && { oauthToken: input.oauthToken }),
    });
    return { id: existing.id, isNew: false };
  }
  const account = addAccount(input);
  return { id: account.id, isNew: true };
}

export default class AccountLogin extends BaseCommand<typeof AccountLogin> {
  static description = "Login to a provider via OAuth or automatic token capture";
  static examples = [
    "<%= config.bin %> account login copilot",
    "<%= config.bin %> account login cursor",
  ];

  static strict = false;

  async run(): Promise<void> {
    const provider = this.argv?.[0] as string | undefined;

    if (provider === "copilot") {
      return this.loginCopilot();
    }

    if (provider === "cursor") {
      return this.loginCursor();
    }

    // Show help
    console.log("");
    console.log(dim("Usage: relay account login <provider>"));
    console.log(dim(""));
    console.log(dim("Supported providers:"));
    console.log(dim("  copilot  — GitHub Copilot (OAuth device flow)"));
    console.log(dim("  cursor   — Cursor (reads session token from local agent/IDE)"));
    console.log("");
  }

  /**
   * Login to GitHub Copilot via OAuth device flow.
   */
  private async loginCopilot(): Promise<void> {
    console.log("");
    console.log(cyan(bold("  GitHub Copilot Login")));
    console.log(dim("  ─────────────────────────────"));
    console.log("");

    // Get account name (email)
    let name = "";
    while (!name) {
      const raw = (await text({
        message: "  Account name (email address):",
        placeholder: "you@github.com",
        validate: (v) => {
          if (!v?.trim()) return "Name is required.";
          if (!isValidEmail(v)) return "Must be a valid email address.";
          return undefined;
        },
      })) as string;
      if (isCancel(raw)) return;
      name = raw.trim();
    }

    try {
      const result = await completeDeviceFlow(
        (info) => {
          console.log("");
          console.log(`  ${ok("1.")} Open this URL in your browser:`);
          console.log(`     ${bold(info.verification_uri)}`);
          console.log("");
          console.log(`  ${ok("2.")} Enter this code:`);
          console.log(`     ${bold(info.user_code)}`);
          console.log("");
          console.log(dim("  Waiting for authorization..."));
        },
        () => {
          // Silent polling indicator
        },
      );

      console.log("");
      console.log(`  ${ok("OK")} Authorization successful!`);

      // Store as account with the Copilot session token
      // Also store the OAuth token for usage queries (copilot_internal/user needs gho_ token)
      const account = addAccount({
        name,
        provider: "copilot",
        apiKey: result.copilotToken,
        oauthToken: result.ghoToken,
      });

      const current = getActiveAccount();
      if (!current || current.id !== account.id) {
        switchAccount(account.id);
      }

      // Mirror to legacy settings
      settings.setProviderConfig("copilot", { apiKey: result.copilotToken, baseUrl: "" });

      const expiresDate = new Date(result.expiresAt * 1000);
      console.log("");
      console.log(ok("Account added!"));
      console.log(dim(`  Token expires at: ${expiresDate.toISOString()}`));
      console.log(dim(`  Note: Copilot session tokens expire ~30 minutes.`));
      console.log(dim(`  Use a fine-grained PAT for longer-lived tokens.`));
      console.log("");
      console.log(success("Active account set to this account."));
    } catch (err) {
      console.log("");
      console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
      console.log("");
      console.log(dim("  Alternatively, add a Copilot account with a fine-grained PAT:"));
      console.log(
        dim("  relay account add --name you@github.com --provider copilot --key github_pat_..."),
      );
    }
  }

  /**
   * Login to Cursor by reading the session token from local sources,
   * or falling back to browser-based PKCE login.
   *
   * Flow:
   * 1. Check for valid local token (cursor-agent auth.json or Cursor IDE state DB)
   * 2. If found and valid, store it
   * 3. If expired or not found, offer browser-based PKCE login
   */
  private async loginCursor(): Promise<void> {
    console.log("");
    console.log(cyan(bold("  Cursor Login")));
    console.log(dim("  ─────────────────────────────"));
    console.log("");

    deduplicateAccounts();

    // Try to get a session token from local sources
    const sessionToken = getCursorSessionToken();

    if (sessionToken && !sessionToken.isExpired) {
      const email = sessionToken.email || readCursorCliConfig()?.email || "";

      if (!email) {
        console.log(warn("  Could not determine your Cursor account email."));
        console.log("");
        console.log(dim("  Please log in to Cursor IDE or cursor-agent first, then try again."));
        return;
      }

      // Success! Store the account
      console.log(`  ${ok("OK")} Found valid session token (${sessionToken.source}) for ${email}`);

      // Decode JWT for expiry info
      const payload = JSON.parse(
        Buffer.from(sessionToken.token.split(".")[1] + "=", "base64url").toString(),
      );
      if (payload.exp) {
        const expiresAt = new Date((payload.exp as number) * 1000);
        console.log(dim(`  Expires: ${expiresAt.toISOString()}`));
      }

      const { id: accountId, isNew } = upsertAccount({
        name: email,
        provider: "cursor",
        apiKey: sessionToken.token,
      });

      const current = getActiveAccount();
      if (!current || current.id !== accountId) {
        switchAccount(accountId);
      }

      console.log("");
      console.log(ok(isNew ? "Account added!" : "Account updated!"));
      console.log(
        dim(`  Note: Session tokens expire periodically. Run this command again to refresh.`),
      );
      console.log(dim(`  Run "relay usage" to check your Cursor usage.`));
      console.log("");
      console.log(success("Active account set to this account."));
      return;
    }

    // No valid local token — try browser-based PKCE login
    if (sessionToken?.isExpired) {
      console.log(
        dim(`  Local token (${sessionToken.source}) is expired. Starting browser login...`),
      );
      console.log("");
    }

    try {
      console.log(`  ${ok("1.")} Opening browser for Cursor login...`);
      console.log(dim("     If the browser doesn't open, use the URL below:"));
      console.log("");

      const result = await pkceBrowserLogin((url) => {
        console.log(`     ${bold(url)}`);
        console.log("");
        console.log(dim("  Waiting for you to complete login in the browser..."));
      });

      console.log("");
      console.log(`  ${ok("OK")} Login successful!`);

      const email = result.email || readCursorCliConfig()?.email || "";
      const accountName = email || "cursor-user";

      const { id: accountId, isNew } = upsertAccount({
        name: accountName,
        provider: "cursor",
        apiKey: result.accessToken,
      });

      const current = getActiveAccount();
      if (!current || current.id !== accountId) {
        switchAccount(accountId);
      }

      console.log("");
      console.log(ok(isNew ? "Account added!" : "Account updated!"));
      console.log("");
      console.log(dim("  To enable usage data, provide your WorkosCursorSessionToken:"));
      console.log(dim("  1. Open DevTools (F12) > Application > Cookies > cursor.com"));
      console.log(dim("  2. Copy the value of WorkosCursorSessionToken"));
      console.log(dim(`  3. Run: relay account edit --name "${accountName}" --key <token>`));
      console.log("");
      console.log(success("Active account set to this account."));
    } catch (err) {
      console.log("");
      console.log(
        warn(`  Browser login failed: ${err instanceof Error ? err.message : String(err)}`),
      );
      console.log("");
      console.log(dim("  Alternatives:"));
      if (isCursorAgentInstalled()) {
        console.log(dim("    Run: cursor-agent login && relay account login cursor"));
      } else if (isCursorIdeInstalled()) {
        console.log(dim("    Open Cursor IDE and log in, then run: relay account login cursor"));
      } else {
        console.log(dim("    Install cursor-agent or Cursor IDE"));
      }
      console.log(dim("    Or add a session token manually:"));
      console.log(
        dim("    relay account add --name you@email.com --provider cursor --key <token>"),
      );
    }
  }
}
