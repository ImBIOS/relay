import { Args } from "@oclif/core";
import { Box } from "ink";
import { updateAlert } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Success } from "../../ui/index";

export default class AlertEnable extends BaseCommand<typeof AlertEnable> {
  static description = "Enable an alert";
  static examples = ["<%= config.bin %> alert enable alert_123"];

  static args = {
    id: Args.string({
      description: "Alert ID to enable",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const id = this.args.id;
    updateAlert(id, { enabled: true });

    await this.renderApp(
      <Box>
        <Success>Alert {id} enabled</Success>
      </Box>,
    );
  }
}
