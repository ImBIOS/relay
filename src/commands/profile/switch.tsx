import { Args } from "@oclif/core";
import { Box } from "ink";
import * as profiles from "../../config/profiles";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Success } from "../../ui/index";

export default class ProfileSwitch extends BaseCommand<typeof ProfileSwitch> {
  static description = "Switch to a profile";
  static examples = ["<%= config.bin %> profile switch work"];

  static args = {
    name: Args.string({
      description: "Profile name to switch to",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const name = this.args.name;

    if (profiles.switchProfile(name)) {
      await this.renderApp(
        <Box>
          <Success>Switched to profile "{name}"</Success>
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
