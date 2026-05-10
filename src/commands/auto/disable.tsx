import { BaseCommand } from "../../oclif/base";
import { configureRotation } from "../../config/accounts-config";
import { success } from "../../utils/console";

export default class AutoDisable extends BaseCommand<typeof AutoDisable> {
  static description = "Disable automatic provider rotation";

  async run(): Promise<void> {
    configureRotation(false);

    console.log("");
    console.log(success("Auto rotation disabled."));
  }
}
