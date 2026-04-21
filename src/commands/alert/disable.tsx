import { Args } from "@oclif/core";
import { Box } from "ink";
import { updateAlert } from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Success } from "../../ui/index";

export default class AlertDisable extends BaseCommand<typeof AlertDisable> {
  static description = "Disable an alert";
  static examples = ["<%= config.bin %> alert disable alert_123"];

  static args = {
    id: Args.string({
      description: "Alert ID to disable",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const id = this.args.id;
    updateAlert(id, { enabled: false });

    await this.renderApp(
      <Box>
        <Success>Alert {id} disabled</Success>
      </Box>
    );
  }
}
