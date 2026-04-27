import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Section, Success } from "../../ui/index";

const PLUGIN_DESCRIPTIONS: Record<string, string> = {
  "relay-commit":
    "AI-powered auto stage, commit, and push with parallel security + performance analysis",
  "relay-format": "Format files after Write/Edit tool calls",
  "relay-security-analysis": "Analyze staged changes for security vulnerabilities before commit",
  "relay-performance-analysis":
    "Analyze staged changes for performance anti-patterns before commit",
};

const PLUGIN_DEPENDENCIES = ["@opencode-ai/sdk"];

const GLOBAL_PLUGIN_DIR = path.join(os.homedir(), ".config", "opencode", "plugins");
const OPENCODE_CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");

export default class PluginsInstall extends BaseCommand<typeof PluginsInstall> {
  static description = "Install all relay OpenCode plugins";
  static examples = ["<%= config.bin %> plugins install"];

  async run(): Promise<void> {
    try {
      if (!fs.existsSync(GLOBAL_PLUGIN_DIR)) {
        fs.mkdirSync(GLOBAL_PLUGIN_DIR, { recursive: true });
      }

      const pluginSrcDir = path.join(
        this.config.root,
        "node_modules/@alsafa/relay-opencode-plugins/dist",
      );
      const pluginFiles = [
        "relay-commit.js",
        "relay-format.js",
        "relay-security-analysis.js",
        "relay-performance-analysis.js",
      ];
      let installed = 0;
      let skipped = 0;

      for (const filename of pluginFiles) {
        const destPath = path.join(GLOBAL_PLUGIN_DIR, filename);
        const srcPath = path.join(pluginSrcDir, filename);

        if (fs.existsSync(destPath)) {
          skipped++;
        } else if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          installed++;
        } else {
          this.error(`Source plugin not found: ${srcPath}`);
        }
      }

      const opencodeConfigPath = path.join(os.homedir(), ".config", "opencode", "opencode.json");
      let config: Record<string, unknown> = {};
      if (fs.existsSync(opencodeConfigPath)) {
        try {
          config = JSON.parse(fs.readFileSync(opencodeConfigPath, "utf-8"));
        } catch {
          config = {};
        }
      }

      config.plugin = ((config.plugin as string[]) || []).filter((p) => !p.includes("relay"));

      const configDir = path.dirname(opencodeConfigPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(opencodeConfigPath, JSON.stringify(config, null, 2));

      const opencodePkgPath = path.join(OPENCODE_CONFIG_DIR, "package.json");
      let opencodePkg: Record<string, unknown> = { dependencies: {} };
      if (fs.existsSync(opencodePkgPath)) {
        try {
          opencodePkg = JSON.parse(fs.readFileSync(opencodePkgPath, "utf-8"));
        } catch {
          opencodePkg = { dependencies: {} };
        }
      }
      const deps = (opencodePkg.dependencies as Record<string, string>) || {};
      let depsChanged = false;
      for (const pkg of PLUGIN_DEPENDENCIES) {
        if (!deps[pkg]) {
          deps[pkg] = "latest";
          depsChanged = true;
        }
      }
      if (depsChanged) {
        opencodePkg.dependencies = deps;
        fs.writeFileSync(opencodePkgPath, JSON.stringify(opencodePkg, null, 2));
        const installProc = Bun.spawn(["bun", "install"], { cwd: OPENCODE_CONFIG_DIR });
        await installProc.exitCode;
      }

      await this.renderApp(
        <Section title="Plugins Install">
          <Box flexDirection="column">
            <Success>
              Installed {installed} plugin(s), {skipped} already present.
            </Success>
            <Box marginTop={1}>
              <Text dimColor>Plugin directory: {GLOBAL_PLUGIN_DIR}</Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
              <Info>Installed plugins:</Info>
              {Object.entries(PLUGIN_DESCRIPTIONS).map(([name, desc]) => (
                <Box key={name} marginLeft={2}>
                  <Text>
                    {name}: {desc}
                  </Text>
                </Box>
              ))}
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                Run <Text bold>relay opencode</Text> to start OpenCode with plugins.
              </Text>
            </Box>
          </Box>
        </Section>,
      );
    } catch (error: unknown) {
      const err = error as Error;
      await this.renderApp(
        <Section title="Plugins Install">
          <Box flexDirection="column">
            <ErrorBadge>Failed to install plugins</ErrorBadge>
            <Box marginTop={1}>
              <Text color="red">{err.message}</Text>
            </Box>
          </Box>
        </Section>,
      );
    }
  }
}
