import { Args } from "@oclif/core";
import { Box } from "ink";
import * as accountsConfig from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Info, Success } from "../../ui/index";

export default class DashboardStart extends BaseCommand<typeof DashboardStart> {
  static description = "Start the web dashboard";
  static examples = ["<%= config.bin %> dashboard start", "<%= config.bin %> dashboard start 8080"];

  static args = {
    port: Args.integer({
      description: "Port to run the dashboard on",
      required: false,
      default: 3456,
    }),
  };

  async run(): Promise<void> {
    const port = this.args.port || 3456;
    accountsConfig.toggleDashboard(true, port);

    await this.renderApp(
      <Box flexDirection="column">
        <Success>Dashboard enabled on port {port}</Success>
        <Info>Run 'relay dashboard' to start the web server</Info>
      </Box>,
    );
  }
}
