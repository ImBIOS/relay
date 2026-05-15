import { BaseCommand } from "../../oclif/base";
import { completeDeviceFlow } from "../../utils/github-oauth";
import { addAccount, getActiveAccount, switchAccount } from "../../config/accounts-config";
import * as settings from "../../config/settings";
import { bold, cyan, dim, ok, success } from "../../utils/console";
import { isValidEmail } from "../../utils/validate";
import { text, isCancel } from "@clack/prompts";

export default class AccountLogin extends BaseCommand<typeof AccountLogin> {
  static description = "Login to GitHub Copilot via OAuth device flow";
  static examples = [
    "<%= config.bin %> account login copilot",
  ];

  static strict = false;

  async run(): Promise<void> {
    const provider = this.argv?.[0] as string | undefined;

    if (provider !== "copilot") {
      console.log("");
      console.log(dim("Usage: relay account login copilot"));
      console.log(dim(""));
      console.log(dim("Supported providers:"));
      console.log(dim("  copilot  — GitHub Copilot (OAuth device flow)"));
      console.log("");
      return;
    }

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
      const account = addAccount({
        name,
        provider: "copilot",
        apiKey: result.copilotToken,
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
      console.log(dim("  relay account add --name you@github.com --provider copilot --key github_pat_..."));
    }
  }
}
