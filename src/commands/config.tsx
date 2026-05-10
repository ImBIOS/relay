import { isCancel, text } from "@clack/prompts";
import * as accountsConfig from "../config/accounts-config";
import { BaseCommand } from "../oclif/base";
import { divider, ok } from "../utils/console";

export default class Config extends BaseCommand<typeof Config> {
  static description = "Configure API providers (interactive)";
  static examples = ["<%= config.bin %> config"];

  async run(): Promise<void> {
    console.log("");
    console.log("  Configure API Providers");
    console.log(divider("─", 50));

    const providers = ["zai", "minimax"] as const;

    for (const provider of providers) {
      const existing = Object.values(accountsConfig.loadConfig().accounts).find(
        (a) => a.provider === provider,
      );
      if (existing) {
        console.log(`\n  ${ok("✓")} ${provider.toUpperCase()} — ${existing.name}`);
        continue;
      }

      console.log(`\n  Configuring ${provider.toUpperCase()}...`);

      const apiKey = (await text({
        message: `  API key for ${provider.toUpperCase()}:`,
        placeholder: "sk-...",
        validate: (v) => {
          if (!v?.trim()) return "API key cannot be empty.";
          return undefined;
        },
      })) as string;

      if (isCancel(apiKey)) {
        console.log("\n  Configuration cancelled.");
        return;
      }

      const emailName = `${provider}@config.local`;
      accountsConfig.addAccount({ name: emailName, provider, apiKey: apiKey.trim() });
      accountsConfig.switchAccount(
        Object.values(accountsConfig.loadConfig().accounts).find(
          (a) => a.provider === provider,
        )!.id,
      );

      console.log(`  ${ok("✓")} ${provider.toUpperCase()} configured`);
    }

    console.log("\n");
    console.log(ok("Configuration complete!"));
    console.log(divider("─", 50));
    console.log("  Run 'relay account list' to see configured accounts");
  }
}
