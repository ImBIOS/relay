import { isCancel, select, text } from "@clack/prompts";
import { getAccount, updateAccount } from "../../config/accounts-config";
import * as settings from "../../config/settings";
import { BaseCommand } from "../../oclif/base";
import { error, label, ok, success } from "../../utils/console";
import { isValidEmail } from "../../utils/validate";

export default class AccountEdit extends BaseCommand<typeof AccountEdit> {
  static description = "Edit an account's name, API key, group ID, or base URL";
  static examples = [
    "<%= config.bin %> account edit acc_xxx --name user@zai.com",
    "<%= config.bin %> account edit acc_xxx --group-id grp-xxx",
  ];

  async run(): Promise<void> {
    const accountId = this.argv?.[0] as string | undefined;

    if (!accountId) {
      console.error(error("Usage: relay account edit <account-id> [flags]"));
      console.error("Run 'relay account list' to see account IDs.");
      this.exit(1);
    }

    // ── Non-interactive flags ────────────────────────────────────────────────
    const nameFlag = this.flags.name as string | undefined;
    const apiKeyFlag = this.flags["api-key"] as string | undefined;
    const groupIdFlag = this.flags["group-id"] as string | undefined;
    const baseUrlFlag = this.flags["base-url"] as string | undefined;

    const hasFlags = !!(nameFlag || apiKeyFlag || groupIdFlag || baseUrlFlag);

    const account = getAccount(accountId);
    if (!account) {
      console.error(error(`Account not found: ${accountId}`));
      console.error("Run 'relay account list' to see account IDs.");
      this.exit(1);
    }

    // ── Apply non-interactive flag updates ────────────────────────────────────
    if (hasFlags) {
      const updates: Parameters<typeof updateAccount>[1] = {};

      if (nameFlag) {
        if (!isValidEmail(nameFlag)) {
          console.error(error(`Account name must be a valid email. Got: ${nameFlag}`));
          this.exit(1);
        }
        updates.name = nameFlag;
      }
      if (apiKeyFlag) {
        if (!apiKeyFlag.trim()) {
          console.error(error("API key cannot be empty."));
          this.exit(1);
        }
        updates.apiKey = apiKeyFlag;
      }
      if (groupIdFlag !== undefined) {
        updates.groupId = groupIdFlag || undefined;
      }
      if (baseUrlFlag !== undefined) {
        updates.baseUrl = baseUrlFlag || undefined;
      }

      const updated = updateAccount(accountId, updates);

      // Sync to legacy settings (only apiKey and baseUrl are needed)
      settings.setProviderConfig(account.provider, {
        apiKey: updated?.apiKey ?? account.apiKey,
        baseUrl: updated?.baseUrl ?? account.baseUrl,
      });

      console.log("");
      console.log(ok("Account updated!"));
      if (nameFlag) console.log(label("Name") + `  ${nameFlag}`);
      if (apiKeyFlag) console.log(label("API Key") + `  [updated]`);
      if (groupIdFlag !== undefined) console.log(label("Group ID") + `  ${groupIdFlag ?? "[cleared]"}`);
      if (baseUrlFlag !== undefined) console.log(label("Base URL") + `  ${baseUrlFlag ?? "[default]"}`);
      return;
    }

    // ── Interactive ──────────────────────────────────────────────────────────
    const choices = [
      { label: "Name", value: "name" },
      { label: "API Key", value: "api-key" },
      { label: "Group ID", value: "group-id" },
      { label: "Base URL", value: "base-url" },
    ];

    const chosen = (await select({
      message: `Edit which field for ${account.name}?`,
      options: choices,
    })) as string;

    if (isCancel(chosen)) return;

    let updated = false;

    switch (chosen) {
      case "name": {
        const value = (await text({
          message: "New account name (email):",
          initialValue: account.name,
          validate(v) {
            if (!v) return "Name is required.";
            if (!isValidEmail(v)) return "Must be a valid email address.";
            return undefined;
          },
        })) as string;
        if (isCancel(value)) return;
        updateAccount(accountId, { name: value.trim() });
        updated = true;
        break;
      }
      case "api-key": {
        const value = (await text({
          message: "New API key:",
          initialValue: "",
          validate(v) {
            if (!v) return "API key is required.";
            return undefined;
          },
        })) as string;
        if (isCancel(value)) return;
        updateAccount(accountId, { apiKey: value.trim() });
        settings.setProviderConfig(account.provider, { apiKey: value.trim(), baseUrl: account.baseUrl ?? "" });
        updated = true;
        break;
      }
      case "group-id": {
        const value = (await text({
          message: "MiniMax Group ID:",
          initialValue: account.groupId ?? "",
        })) as string;
        if (isCancel(value)) return;
        updateAccount(accountId, { groupId: value.trim() || undefined });
        updated = true;
        break;
      }
      case "base-url": {
        const value = (await text({
          message: "Base URL:",
          initialValue: account.baseUrl ?? "",
        })) as string;
        if (isCancel(value)) return;
        updateAccount(accountId, { baseUrl: value.trim() || undefined });
        updated = true;
        break;
      }
    }

    if (updated) {
      console.log("");
      console.log(success(`Account '${chosen}' updated.`));
    }
  }
}
