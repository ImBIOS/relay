import { Box } from "ink";
import * as accountsConfig from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Success } from "../../ui/index";

export default class DashboardStop extends BaseCommand<typeof DashboardStop> {
  static description = "Stop the dashboard";
  static examples = ["<%= config.bin %> dashboard stop"];

  async run(): Promise<void> {
    accountsConfig.toggleDashboard(false);

    await this.renderApp(
      <Box>
        <Success>Dashboard disabled.</Success>
      </Box>
    );
  }
}
