// @ts-nocheck
import { BaseCommand } from "../../oclif/base";
import { loadConfig } from "../../config/accounts-config";
import { zaiProvider } from "../../providers/zai";
import { minimaxProvider } from "../../providers/minimax";
import { error, info, ok, warn } from "../../utils/console";

export default class Doctor extends BaseCommand<typeof Doctor> {
  static description = "Check relay configuration and provider connectivity";

  async run(): Promise<void> {
    console.log("");
    console.log("  Relay Doctor");
    console.log("  ─────────────────────────────");

    const config = loadConfig();
    const accounts = Object.values(config.accounts);

    if (accounts.length === 0) {
      console.log("");
      console.log(warn("  No accounts configured. Run `relay account add` first."));
      return;
    }

    let allOk = true;

    console.log("");
    console.log("  Config");
    console.log(`  ${ok("OK")} Config file: ~/.config/relay/settings.json`);
    console.log(`  ${ok("OK")} Accounts: ${accounts.length}`);

    const active = config.accounts[config.activeAccountId ?? ""];
    if (active) {
      console.log(`  ${ok("OK")} Active: ${active.name} (${active.provider})`);
    } else {
      console.log(`  ${warn("WARN")} No active account.`);
      allOk = false;
    }

    for (const account of accounts) {
      console.log("");
      console.log(`  Account: ${account.name}`);
      console.log(`  ${ok("OK")} Provider: ${account.provider}`);

      const provider = account.provider === "zai" ? zaiProvider : minimaxProvider;
      const base = account.baseUrl ?? provider.defaultBaseUrl;
      console.log(`  ${ok("OK")} Base URL: ${base}`);

      if (account.provider === "minimax" && !account.groupId) {
        console.log(`  ${warn("WARN")} No groupId — usage tracking disabled.`);
      }

      try {
        console.log(`  ${info("...")} Testing ${account.provider}...`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${base}/health`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${account.apiKey}` },
        });
        clearTimeout(timeout);
        if (res.ok) {
          console.log(`  ${ok("OK")} API responds: ${res.status}`);
        } else {
          console.log(`  ${warn("WARN")} API: ${res.status}`);
        }
      } catch {
        console.log(`  ${error("FAIL")} Cannot reach ${account.provider} API.`);
        allOk = false;
      }
    }

    console.log("");
    console.log(allOk ? `  ${ok("All checks passed.")}` : `  ${warn("Some checks failed.")}`);
    if (!allOk) process.exit(1);
  }
}
