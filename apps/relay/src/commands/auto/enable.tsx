import { Args, Flags } from "@oclif/core";
import { Box } from "ink";
import type { RotationStrategy } from "../../config/accounts-config";
import { configureRotation, loadConfig } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Info, Success } from "../../ui/index";

export default class AutoEnable extends BaseCommand<typeof AutoEnable> {
  static description = "Enable auto-rotation";
  static examples = [
    "<%= config.bin %> auto enable",
    "<%= config.bin %> auto enable round-robin",
    "<%= config.bin %> auto enable random --cross-provider",
  ];

  static args = {
    strategy: Args.string({
      description: "Rotation strategy",
      required: false,
      options: ["round-robin", "least-used", "priority", "random"],
    }),
  };

  static flags = {
    "cross-provider": Flags.boolean({
      description: "Enable cross-provider rotation",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const strategy = this.args.strategy as RotationStrategy | undefined;
    const crossProvider = this.flags["cross-provider"];

    configureRotation(true, strategy, crossProvider);
    const config = loadConfig();

    await this.renderApp(
      <Box flexDirection="column">
        <Success>Auto-rotation enabled.</Success>
        <Info>Strategy: {config.rotation.strategy}</Info>
        <Info>
          Cross-provider:{" "}
          {config.rotation.crossProvider ? "enabled" : "disabled"}
        </Info>
      </Box>
    );
  }
}
