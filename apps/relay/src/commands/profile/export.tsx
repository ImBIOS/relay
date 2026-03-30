import { Args } from "@oclif/core";
import { Box } from "ink";
import * as profiles from "../../config/profiles";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info } from "../../ui/index";

export default class ProfileExport extends BaseCommand<typeof ProfileExport> {
  static description = "Export profile as shell variables";
  static examples = [
    "<%= config.bin %> profile export work",
    'eval "$(<%= config.bin %> profile export work)"',
  ];

  static args = {
    name: Args.string({
      description: "Profile name to export (defaults to active profile)",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const name = this.args.name || profiles.getActiveProfile()?.name;

    if (!name) {
      await this.renderApp(
        <Box>
          <ErrorBadge>No active profile. Specify a profile name.</ErrorBadge>
        </Box>
      );
      return;
    }

    const exportStr = profiles.exportProfile(name);

    if (exportStr) {
      // Output raw for eval
      console.log(exportStr);
      await this.renderApp(
        <Box>
          <Info>Run 'eval "$(relay profile export {name})"' to apply.</Info>
        </Box>
      );
    } else {
      await this.renderApp(
        <Box>
          <ErrorBadge>Profile "{name}" not found.</ErrorBadge>
        </Box>
      );
    }
  }
}
