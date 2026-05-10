import { BaseCommand } from "../../oclif/base";
import { getProxyStatus } from "../../proxy/index";
import { ok, success, warn } from "../../utils/console";

export default class ProxyStatus extends BaseCommand<typeof ProxyStatus> {
  static description = "Check proxy server status";

  async run(): Promise<void> {
    const status = getProxyStatus();
    console.log("");
    if (status.running) {
      console.log(success("  Relay proxy is running."));
      console.log(`  ${ok("Port:")} ${status.port ?? 8787}`);
      console.log(`  ${ok("URL:")} http://127.0.0.1:${status.port ?? 8787}`);
    } else {
      console.log(`${warn("  Relay proxy is not running.")}`);
      console.log(`  Run: relay proxy start`);
    }
  }
}
