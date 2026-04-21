import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Error as ErrorBadge, Info, Section, Success } from "../../ui/index";

interface HookConfig {
  type: string;
  command: string;
}

interface HookGroup {
  matcher?: string;
  hooks: HookConfig[];
}

interface HooksConfig {
  [key: string]: HookGroup[] | undefined;
}

interface ClaudeSettings {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

/**
 * All hook events and command patterns that relay manages.
 * Used to detect and remove our hooks from settings.json.
 */
const RELAY_HOOK_EVENTS = ["SessionStart", "PostToolUse", "Stop"] as const;

/** Matches any relay hook command (current and legacy) */
const RELAY_COMMAND_PATTERN =
  /hooks session-start|hooks post-tool|hooks stop|auto hook|auto-rotate\.sh/;

export default class HooksUninstall extends BaseCommand<typeof HooksUninstall> {
  static description = "Remove all Claude Code hooks";
  static examples = ["<%= config.bin %> hooks uninstall"];

  async run(): Promise<void> {
    const settingsFilePath = path.join(
      os.homedir(),
      ".claude",
      "settings.json"
    );
    const hooksDir = path.join(os.homedir(), ".claude", "hooks");
    const hookScriptPath = path.join(hooksDir, "auto-rotate.sh");

    try {
      let hookRemoved = false;
      let settingsModified = false;
      let hooksRemoved = 0;

      // Remove legacy hook script if it exists
      if (fs.existsSync(hookScriptPath)) {
        fs.unlinkSync(hookScriptPath);
        hookRemoved = true;
      }

      // Remove plugin cache marker
      const cacheMarker = path.join(
        os.homedir(),
        ".claude",
        ".zai-plugins-installed"
      );
      if (fs.existsSync(cacheMarker)) {
        fs.unlinkSync(cacheMarker);
      }

      // Update settings.json to remove all relay hooks
      if (fs.existsSync(settingsFilePath)) {
        const content = fs.readFileSync(settingsFilePath, "utf-8");
        let settings: ClaudeSettings;

        try {
          settings = JSON.parse(content) as ClaudeSettings;
        } catch {
          settings = {};
        }

        for (const hookType of RELAY_HOOK_EVENTS) {
          if (settings.hooks?.[hookType]) {
            const originalLength = settings.hooks[hookType]!.length;

            settings.hooks[hookType] = settings.hooks[hookType]!.filter(
              (hookGroup) => {
                if (!(hookGroup.hooks && Array.isArray(hookGroup.hooks))) {
                  return true;
                }

                const hasOurHook = hookGroup.hooks.some(
                  (hookConfig) =>
                    hookConfig.type === "command" &&
                    hookConfig.command &&
                    RELAY_COMMAND_PATTERN.test(hookConfig.command)
                );

                return !hasOurHook;
              }
            );

            if (settings.hooks[hookType]!.length !== originalLength) {
              hooksRemoved += originalLength - settings.hooks[hookType]!.length;
              settingsModified = true;

              // Clean up empty arrays
              if (settings.hooks[hookType]!.length === 0) {
                delete settings.hooks[hookType];
              }
            }
          }
        }

        // Clean up empty hooks object
        if (settings.hooks && Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }

        if (settingsModified) {
          fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
        }
      }

      if (!(hookRemoved || settingsModified)) {
        await this.renderApp(
          <Section title="Hooks Uninstall">
            <Box flexDirection="column">
              <Info>No relay hooks found.</Info>
              <Box marginTop={1}>
                <Text dimColor>
                  Hooks may have already been removed or were never installed.
                </Text>
              </Box>
            </Box>
          </Section>
        );
        return;
      }

      await this.renderApp(
        <Section title="Hooks Uninstall">
          <Box flexDirection="column">
            <Success>Removed {hooksRemoved} hook(s).</Success>
            {hookRemoved && (
              <Box marginTop={1}>
                <Text dimColor>Removed legacy hook script</Text>
              </Box>
            )}
            {settingsModified && (
              <Box marginTop={1}>
                <Text dimColor>
                  Updated Claude settings: {settingsFilePath}
                </Text>
              </Box>
            )}
            <Box flexDirection="column" marginTop={1}>
              <Info>
                Auto-rotation, formatting, and commit prompts are no longer
                automatic.
              </Info>
              <Box marginTop={1}>
                <Text dimColor>
                  For notifications, use <Text bold>peon-ping</Text> instead.
                </Text>
              </Box>
              <Info>To re-enable hooks, run "relay hooks install".</Info>
            </Box>
          </Box>
        </Section>
      );
    } catch (error: unknown) {
      const err = error as Error;
      await this.renderApp(
        <Section title="Hooks Uninstall">
          <Box flexDirection="column">
            <ErrorBadge>Failed to uninstall hooks</ErrorBadge>
            <Box marginTop={1}>
              <Text color="red">{err.message}</Text>
            </Box>
          </Box>
        </Section>
      );
    }
  }
}
