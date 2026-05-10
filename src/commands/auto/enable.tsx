import { BaseCommand } from "../../oclif/base";
import { configureRotation } from "../../config/accounts-config";
import { error, success } from "../../utils/console";

export default class AutoEnable extends BaseCommand<typeof AutoEnable> {
  static description = "Enable automatic provider rotation";
  static examples = ["<%= config.bin %> auto enable least-used"];

  async run(): Promise<void> {
    const strategy = (this.argv?.[0] as string | undefined) ?? "least-used";

    if (strategy !== "least-used") {
      console.error(error(`Unknown strategy: ${strategy}`));
      console.error("Only 'least-used' is supported.");
      this.exit(1);
    }

    configureRotation(true, "least-used");

    console.log("");
    console.log(success(`Auto rotation enabled (strategy: ${strategy}).`));
  }
}
