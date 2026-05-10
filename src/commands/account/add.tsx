import { addAccount, getActiveAccount, switchAccount } from "../../config/accounts-config";
import {
  getDefaultBaseUrl,
  getProviderCliLabel,
  listRelayProviders,
} from "../../config/provider-metadata";
import * as settings from "../../config/settings";
import { BaseCommand } from "../../oclif/base";
import { isCancel, select, text } from "@clack/prompts";
import { divider, label, ok, success } from "../../utils/console";
import { isValidEmail } from "../../utils/validate";

export default class AccountAdd extends BaseCommand<typeof AccountAdd> {
  static description = "Add a new provider account";
  static examples = [
    "<%= config.bin %> account add",
    "<%= config.bin %> account add --name user@zai.com --provider zai --key sk-xxx",
  ];

  async run(): Promise<void> {
    const nameArg = this.argv?.[0] as string | undefined;
    const providerArg = this.argv?.[1] as string | undefined;
    const apiKeyArg = this.argv?.[2] as string | undefined;

    // ── Collect inputs (non-interactive args or interactive prompts) ─────────
    let name: string;
    let provider: string;
    let apiKey: string;
    let baseUrl: string | undefined;
    let groupId: string | undefined;

    if (nameArg && providerArg && apiKeyArg) {
      // Fully non-interactive
      name = nameArg;
      provider = providerArg;
      apiKey = apiKeyArg;
    } else {
      // Interactive: name
      name = nameArg ?? "";
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
      provider = (providerArg ??
        (await select({
          message: "  Provider:",
          options: providers.map((p) => ({
            label: getProviderCliLabel(p),
            value: p,
          })),
        }))) as string;
      if (isCancel(provider)) return;

      // Interactive: api key
      apiKey = apiKeyArg ?? "";
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
    }

    // ── Persist ─────────────────────────────────────────────────────────────
    const account = addAccount({ name, provider: provider as "zai" | "minimax", apiKey, baseUrl, groupId });

    const current = getActiveAccount();
    if (!current || current.id !== account.id) {
      switchAccount(account.id);
    }

    // Mirror to legacy settings so non-oclif tools still work
    settings.setProviderConfig(provider as "zai" | "minimax", { apiKey, baseUrl: baseUrl ?? "" });

    console.log("");
    console.log(ok("Account added!"));
    console.log(divider("─", 50));
    console.log(label("ID") + `  ${account.id}`);
    console.log(label("Name") + `  ${name}`);
    console.log(label("Provider") + `  ${provider}`);
    console.log(label("Base URL") + `  ${account.baseUrl ?? getDefaultBaseUrl(provider as "zai" | "minimax")}`);
    if (groupId) console.log(label("Group ID") + `  ${groupId}`);
    console.log("");
    console.log(success("Active account set to this account."));
  }
}
