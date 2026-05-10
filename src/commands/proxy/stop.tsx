import { BaseCommand } from "../../oclif/base";
import { stopProxy } from "../../proxy/index";
import { success, warn } from "../../utils/console";

export default class ProxyStop extends BaseCommand<typeof ProxyStop> {
  static description = "Stop the relay proxy server";

  async run(): Promise<void> {
    const stopped = await stopProxy();
    console.log("");
    if (stopped) {
      console.log(success("  Relay proxy stopped."));
    } else {
      console.log(`${warn("  Proxy was not running.")}`);
    }
  }
}
