import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { startProxy } from "../../proxy/index";
import { error, info, ok, success } from "../../utils/console";

export default class ProxyStart extends BaseCommand<typeof ProxyStart> {
  static description = "Start the relay proxy server on :8787";
  static flags = { port: Flags.integer({ default: 8787 }) };

  async run(): Promise<void> {
    const { flags } = await this.parse(ProxyStart);
    const port = flags.port ?? 8787;

    console.log(`  ${info("Starting relay proxy on :" + port + "...")}`);

    try {
      await startProxy({ port });

      console.log("");
      console.log(success(`  Relay proxy running on http://127.0.0.1:${port}`));
      console.log(`  ${ok("Health:")} http://127.0.0.1:${port}/health`);
      console.log("");
      console.log("  Set in your shell:");
      console.log(`    export ANTHROPIC_BASE_URL=http://127.0.0.1:${port}`);
      console.log("    export ANTHROPIC_AUTH_TOKEN=relay");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EADDRINUSE") {
        console.error(error(`  Port ${port} is already in use.`));
        console.error("  Stop it first: relay proxy stop");
      } else {
        console.error(error(`  Failed to start proxy: ${e}`));
      }
      this.exit(1);
    }
  }
}
