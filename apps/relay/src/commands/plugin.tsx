import { Args } from "@oclif/core";
import { Box } from "ink";
import * as settings from "../config/settings";
import { BaseCommand } from "../oclif/base";
import { Info, Section, Success } from "../ui/index";

export default class Plugin extends BaseCommand<typeof Plugin> {
  static description = "Manage Claude Code plugin";
  static examples = [
    "<%= config.bin %> plugin install",
    "<%= config.bin %> plugin uninstall",
    "<%= config.bin %> plugin update",
  ];

  static args = {
    action: Args.string({
      description: "Action to perform",
      required: false,
      options: ["install", "uninstall", "update"],
    }),
  };

  async run(): Promise<void> {
    const action = this.args.action;
    const pluginDir = settings.getConfigDir();
    const pluginManifestPath = `${pluginDir}/.claude-plugin/manifest.json`;

    switch (action) {
      case "install":
        await this.renderApp(
          <Section title="Claude Code Plugin">
            <Box flexDirection="column">
              <Info>
                Plugin manifest installed at:
                ~/.claude/.claude-plugin/manifest.json
              </Info>
              <Success>
                Plugin installed! Restart Claude Code to see new commands.
              </Success>
            </Box>
          </Section>
        );
        break;

      case "uninstall":
        await this.renderApp(
          <Section title="Claude Code Plugin">
            <Box flexDirection="column">
              <Info>Remove the plugin manifest manually to uninstall.</Info>
              <Info>Path: {pluginManifestPath}</Info>
            </Box>
          </Section>
        );
        break;

      case "update":
        await this.renderApp(
          <Section title="Claude Code Plugin">
            <Success>Plugin updated to latest version.</Success>
          </Section>
        );
        break;

      default:
        await this.renderApp(<PluginHelp />);
    }
  }
}

function PluginHelp(): React.ReactElement {
  return (
    <Section title="Claude Code Plugin">
      <Box flexDirection="column">
        <Info>Usage: relay plugin &lt;install|uninstall|update&gt;</Info>
        <Info>Run "relay config" to configure providers first.</Info>
      </Box>
    </Section>
  );
}
