import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Section, Success } from "../../ui/index";
import { PLUGIN_FILES } from "./templates";

const GLOBAL_PLUGIN_DIR = path.join(os.homedir(), ".config", "opencode", "plugins");

export default class PluginsUninstall extends BaseCommand<typeof PluginsUninstall> {
  static description = "Remove all relay OpenCode plugins";
  static examples = ["<%= config.bin %> plugins uninstall"];

  async run(): Promise<void> {
    try {
      let removed = 0;
      let notFound = 0;

      for (const filename of PLUGIN_FILES) {
        const filePath = path.join(GLOBAL_PLUGIN_DIR, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          removed++;
        } else {
          notFound++;
        }
      }

      if (fs.existsSync(GLOBAL_PLUGIN_DIR)) {
        const stale = fs.readdirSync(GLOBAL_PLUGIN_DIR).filter((f) => f.startsWith("relay-") && f.endsWith(".js") && !PLUGIN_FILES.includes(f));
        for (const f of stale) {
          fs.unlinkSync(path.join(GLOBAL_PLUGIN_DIR, f));
          removed++;
        }
      }

      // Remove relay plugins from opencode config
      const opencodeConfigPath = path.join(os.homedir(), ".config", "opencode", "opencode.json");
      if (fs.existsSync(opencodeConfigPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(opencodeConfigPath, "utf-8")) as Record<
            string,
            unknown
          >;
          const plugins = ((config.plugin as string[]) || []).filter((p) => !p.includes("relay"));
          config.plugin = plugins;
          fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2));
        } catch {
          // Ignore JSON parse errors
        }
      }

      await this.renderApp(
        <Section title="Plugins Uninstall">
          <Box flexDirection="column">
            <Success>Removed {removed} plugin(s).</Success>
            {notFound > 0 && (
              <Box marginTop={1}>
                <Text dimColor>{notFound} plugin file(s) were not found.</Text>
              </Box>
            )}
            <Box flexDirection="column" marginTop={1}>
              <Info>AI commit and formatting plugins are no longer active.</Info>
              <Box marginTop={1}>
                <Info>To re-enable, run "relay plugins install".</Info>
              </Box>
            </Box>
          </Box>
        </Section>,
      );
    } catch (error: unknown) {
      const err = error as Error;
      await this.renderApp(
        <Section title="Plugins Uninstall">
          <Box flexDirection="column">
            <ErrorBadge>Failed to uninstall plugins</ErrorBadge>
            <Box marginTop={1}>
              <Text color="red">{err.message}</Text>
            </Box>
          </Box>
        </Section>,
      );
    }
  }
}
