import { Flags } from "@oclif/core";
import { addAccount, getActiveAccount, switchAccount } from "../../config/accounts-config";
import {
  getDefaultBaseUrl,
  getProviderCliLabel,
  listRelayProviders,
} from "../../config/provider-metadata";
import * as settings from "../../config/settings";
import { BaseCommand } from "../../oclif/base";
import { isCancel, select, text } from "@clack/prompts";
import { divider, label, ok, success, dim } from "../../utils/console";
import { isValidEmail } from "../../utils/validate";

export default class AccountAdd extends BaseCommand<typeof AccountAdd> {
  static description = "Add a new provider account";
  static examples = [
    "<%= config.bin %> account add",
    "<%= config.bin %> account add --name user@zai.com --provider zai --key sk-xxx",
  ];
  static flags = {
    name: Flags.string({ description: "Account name (email address)" }),
    provider: Flags.string({ description: "Provider (zai, minimax, or copilot)" }),
    key: Flags.string({ description: "API key" }),
    "group-id": Flags.string({ description: "Group ID (MiniMax only)" }),
  };
  // Use non-strict mode to allow flexible argument passing
  static strict = false;

  async run(): Promise<void> {
    const { flags } = await this.parse(AccountAdd);

    // ── Collect inputs (non-interactive flags or interactive prompts) ─────────
    let name: string;
    let provider: string;
    let apiKey: string;
    let baseUrl: string | undefined;
    let groupId: string | undefined;

    // Use flags if provided, otherwise fall back to interactive
    if (flags.name && flags.provider && flags.key) {
      // Fully non-interactive
      name = flags.name;
      provider = flags.provider;
      apiKey = flags.key;
      if (flags["group-id"]) {
        groupId = flags["group-id"];
      }
    } else if (flags.name || flags.provider || flags.key) {
      // Partial flags provided - need at least name, provider, key
      console.error("Error: --name, --provider, and --key are all required for non-interactive mode");
      console.error("Usage: relay account add --name user@zai.com --provider zai --key sk-xxx");
      this.exit(1);
    } else {
      // Interactive: name
      name = "";
      while (!name) {
        const raw = (await text({
          message: "  Account name (email address):",
          placeholder: "you@zai.com",
          validate: (v) => {
            if (!v?.trim()) return "Name is required.";
            if (!isValidEmail(v)) return "Must be a valid email address.";
            return undefined;
          },
        })) as string;
        if (isCancel(raw)) return;
        name = raw.trim();
      }

      // Interactive: provider
      const providers = listRelayProviders();
      provider = (await select({
        message: "  Provider:",
        options: providers.map((p) => ({
          label: getProviderCliLabel(p),
          value: p,
        })),
      })) as string;
      if (isCancel(provider)) return;

      // Interactive: api key
      apiKey = "";
      while (!apiKey) {
        const raw = (await text({
          message: `  API key for ${provider.toUpperCase()}:`,
          placeholder: "sk-...",
          validate: (v) => {
            if (!v?.trim()) return "API key is required.";
            return undefined;
          },
        })) as string;
        if (isCancel(raw)) return;
        apiKey = raw.trim();
      }

      // Optional: groupId (MiniMax only)
      if (provider === "minimax") {
        const raw = (await text({
          message: "  Group ID (optional, press Enter to skip):",
          placeholder: "grp-...",
        })) as string;
        if (!isCancel(raw) && raw?.trim()) {
          groupId = raw.trim();
        }
      }

      // Copilot: show PAT instructions
      if (provider === "copilot") {
        console.log("");
        console.log(dim("  GitHub Copilot requires a fine-grained Personal Access Token"));
        console.log(dim("  with the 'Copilot Requests' permission enabled."));
        console.log(dim("  Create one at: https://github.com/settings/tokens?type=beta"));
        console.log("");
      }
    }

    // ── Persist ─────────────────────────────────────────────────────────────
    const account = addAccount({ name, provider: provider as "zai" | "minimax" | "copilot", apiKey, baseUrl, groupId });

    const current = getActiveAccount();
    if (!current || current.id !== account.id) {
      switchAccount(account.id);
    }

    // Mirror to legacy settings so non-oclif tools still work
    settings.setProviderConfig(provider as "zai" | "minimax" | "copilot", { apiKey, baseUrl: baseUrl ?? "" });

    console.log("");
    console.log(ok("Account added!"));
    console.log(divider("─", 50));
    console.log(label("ID") + `  ${account.id}`);
    console.log(label("Name") + `  ${name}`);
    console.log(label("Provider") + `  ${provider}`);
    console.log(label("Base URL") + `  ${account.baseUrl ?? getDefaultBaseUrl(provider as "zai" | "minimax" | "copilot")}`);
    if (groupId) console.log(label("Group ID") + `  ${groupId}`);
    console.log("");
    console.log(success("Active account set to this account."));
  }
}
