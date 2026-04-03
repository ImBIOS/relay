import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Section, Success } from "../../ui/index";
import { PLUGIN_DESCRIPTIONS } from "./templates";

const GLOBAL_PLUGIN_DIR = path.join(os.homedir(), ".config", "opencode", "plugins");

export default class PluginsStatus extends BaseCommand<typeof PluginsStatus> {
  static description = "Check OpenCode relay plugins installation status";
  static examples = ["<%= config.bin %> plugins status"];

  async run(): Promise<void> {
    try {
      const pluginEntries = Object.entries(PLUGIN_DESCRIPTIONS);
      const statusEntries: Array<{
        name: string;
        desc: string;
        installed: boolean;
      }> = [];

      for (const [name, desc] of pluginEntries) {
        const filePath = path.join(GLOBAL_PLUGIN_DIR, `${name}.js`);
        statusEntries.push({ name, desc, installed: fs.existsSync(filePath) });
      }

      // Check if plugins are registered in opencode config
      const opencodeConfigPath = path.join(os.homedir(), ".config", "opencode", "opencode.json");
      let registeredInConfig = false;
      let registeredPlugins: string[] = [];

      if (fs.existsSync(opencodeConfigPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(opencodeConfigPath, "utf-8")) as Record<
            string,
            unknown
          >;
          const plugins = (config.plugin as string[]) || [];
          registeredPlugins = plugins.filter((p) => p.includes("relay"));
          registeredInConfig = registeredPlugins.length > 0;
        } catch {
          // Ignore
        }
      }

      const allInstalled = statusEntries.every((e) => e.installed);
      const someInstalled = statusEntries.some((e) => e.installed);

      await this.renderApp(
        <Section title="Plugins Status">
          <Box flexDirection="column">
            <Box>
              <Text bold>Overall Status: </Text>
              {allInstalled && registeredInConfig ? (
                <Success inline>All Installed</Success>
              ) : someInstalled ? (
                <Text color="yellow">Partial</Text>
              ) : (
                <ErrorBadge inline>Not Installed</ErrorBadge>
              )}
            </Box>

            <Box marginTop={1}>
              <Text bold>Plugin Files:</Text>
            </Box>
            {statusEntries.map((entry) => (
              <Box key={entry.name} marginLeft={2}>
                {entry.installed ? (
                  <Success inline>{entry.name}</Success>
                ) : (
                  <ErrorBadge inline>{entry.name}</ErrorBadge>
                )}
                <Text dimColor> - {entry.desc}</Text>
              </Box>
            ))}

            <Box marginTop={1}>
              <Text bold>Plugin Directory: </Text>
              <Text dimColor>{GLOBAL_PLUGIN_DIR}</Text>
            </Box>

            <Box marginTop={1}>
              <Text bold>Registered in Config: </Text>
              {registeredInConfig ? (
                <Success inline>Yes ({registeredPlugins.length})</Success>
              ) : (
                <ErrorBadge inline>No</ErrorBadge>
              )}
            </Box>

            <Box flexDirection="column" marginTop={2}>
              {!allInstalled && (
                <Text color="yellow">Run "relay plugins install" to install missing plugins.</Text>
              )}
              {allInstalled && !registeredInConfig && (
                <Text color="yellow">
                  Plugin files exist but not registered. Run "relay plugins install" to register.
                </Text>
              )}
              {allInstalled && registeredInConfig && (
                <Success>All plugins installed and registered!</Success>
              )}
            </Box>
          </Box>
        </Section>,
      );
    } catch (error: unknown) {
      const err = error as Error;
      await this.renderApp(
        <Section title="Plugins Status">
          <Box flexDirection="column">
            <ErrorBadge>Failed to check plugin status</ErrorBadge>
            <Box marginTop={1}>
              <Text color="red">{err.message}</Text>
            </Box>
          </Box>
        </Section>,
      );
    }
  }
}
