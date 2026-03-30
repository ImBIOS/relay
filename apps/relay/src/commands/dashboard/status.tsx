import * as accountsConfig from "../../config/accounts-config";
import { BaseCommand } from "../../oclif/base";
import { Section, Table } from "../../ui/index";

export default class DashboardStatus extends BaseCommand<
  typeof DashboardStatus
> {
  static description = "Show dashboard configuration";
  static examples = ["<%= config.bin %> dashboard status"];

  async run(): Promise<void> {
    const config = accountsConfig.loadConfig();

    await this.renderApp(
      <Section title="Dashboard Status">
        <Table
          data={{
            Enabled: config.dashboard.enabled ? "Yes" : "No",
            Port: config.dashboard.port.toString(),
            Host: config.dashboard.host,
            Auth: config.dashboard.authToken
              ? `***${config.dashboard.authToken.slice(-4)}`
              : "Not set",
          }}
        />
      </Section>
    );
  }
}
