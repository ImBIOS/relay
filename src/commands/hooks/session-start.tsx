import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { rotateAcrossProviders } from "../../config/accounts-config";
import { saveSettings } from "../../config/settings";
import { error, ok, success, warn } from "../../utils/console";

export default class SessionStart extends BaseCommand<typeof SessionStart> {
  static description = "Start a new session — rotates provider, starts proxy, sets Claude env vars";
  static flags = { silent: Flags.boolean({ default: false }) };

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionStart);
    const silent = !!flags.silent;
    const log = (msg: string) => { if (!silent) console.log(`  ${msg}`); };

    log("Starting relay session...");

    try {
      const result = await rotateAcrossProviders();
      if (!result.account) {
        console.error(error("  No accounts configured. Run `relay account add` first."));
        process.exit(1);
      }
      const account = result.account;
      log(`${ok("OK")} Using: ${account.name} (${account.provider})`);

      const { ensureRelayProxyRunning } = await import("../../proxy/index");
      await ensureRelayProxyRunning();
      log(`${ok("OK")} Proxy running on http://127.0.0.1:8787`);

      saveSettings({
        provider: account.provider,
        zai: { apiKey: account.apiKey, baseUrl: account.baseUrl ?? "", models: ["claude-3-5-sonnet-4-20250514"] },
        minimax: { apiKey: account.apiKey, baseUrl: account.baseUrl ?? "", models: ["glm-4-flash"] },
      });

      const provider = account.provider === "zai"
        ? (await import("../../providers/zai")).zaiProvider
        : (await import("../../providers/minimax")).minimaxProvider;

      log("..." + provider.displayName + " usage...");
      try {
        const stats = await provider.getUsage({ apiKey: account.apiKey, groupId: account.groupId });
        const pct = stats.percentUsed !== undefined ? `${stats.percentUsed.toFixed(1)}%` : "n/a";
        log(`${ok("OK")} Usage: ${pct}`);
      } catch {
        log(`${warn("WARN")} Could not fetch usage`);
      }

      if (!silent) {
        console.log("");
        console.log(success("  Session ready. Claude Code will use relay proxy."));
      }
    } catch (e) {
      console.error(error(`  Failed: ${e}`));
      process.exit(1);
    }
  }
}
