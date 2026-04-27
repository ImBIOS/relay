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
  SessionStart?: HookGroup[];
  PostToolUse?: HookGroup[];
  Stop?: HookGroup[];
  [key: string]: HookGroup[] | undefined;
}

interface ClaudeSettings {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

/**
 * All hooks that relay installs, keyed by Claude Code hook event name.
 */
const RELAY_HOOKS: Array<{
  event: string;
  matcher?: string;
  command: string;
  description: string;
  /** Pattern to detect existing hook (for idempotency) */
  detectPattern: string;
}> = [
  {
    event: "SessionStart",
    matcher: "startup|resume|clear|compact",
    command: "relay hooks session-start --silent",
    description: "Auto-rotate API keys on startup",
    detectPattern: "hooks session-start|auto hook",
  },
  {
    event: "PostToolUse",
    matcher: "Write|Edit",
    command: "relay hooks post-tool --silent",
    description: "Format files after Write|Edit",
    detectPattern: "hooks post-tool",
  },
  {
    event: "Stop",
    command: "relay hooks stop",
    description: "Commit prompt on session end",
    detectPattern: "hooks stop",
  },
];

export default class HooksInstall extends BaseCommand<typeof HooksInstall> {
  static description = "Install all Claude Code hooks globally";
  static examples = ["<%= config.bin %> hooks install"];

  async run(): Promise<void> {
    const claudeSettingsPath = path.join(os.homedir(), ".claude");
    const settingsFilePath = path.join(claudeSettingsPath, "settings.json");

    try {
      // Read existing settings or create new
      let settings: ClaudeSettings = {};
      if (fs.existsSync(settingsFilePath)) {
        const content = fs.readFileSync(settingsFilePath, "utf-8");
        try {
          settings = JSON.parse(content) as ClaudeSettings;
        } catch {
          settings = {};
        }
      }

      // Initialize hooks object if it doesn't exist
      if (!settings.hooks) {
        settings.hooks = {};
      }

      let hooksInstalled = 0;
      let hooksSkipped = 0;

      for (const hookDef of RELAY_HOOKS) {
        const { event, matcher, command, detectPattern } = hookDef;

        if (!settings.hooks[event]) {
          settings.hooks[event] = [];
        }

        // Check if hook already exists (by matching command pattern)
        const detectRegex = new RegExp(detectPattern);
        const exists = settings.hooks[event]!.some((hookGroup) =>
          hookGroup.hooks.some(
            (hookConfig) =>
              hookConfig.type === "command" &&
              hookConfig.command &&
              (hookConfig.command === command || detectRegex.test(hookConfig.command)),
          ),
        );

        if (exists) {
          hooksSkipped++;
        } else {
          const hookGroup: HookGroup = {
            ...(matcher ? { matcher } : {}),
            hooks: [{ type: "command", command }],
          };
          settings.hooks[event]!.push(hookGroup);
          hooksInstalled++;
        }
      }

      // Write updated settings
      fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));

      await this.renderApp(
        <Section title="Hooks Setup">
          <Box flexDirection="column">
            <Success>
              Installed {hooksInstalled} hook(s), {hooksSkipped} already present.
            </Success>
            <Box marginTop={1}>
              <Text dimColor>Settings location: {settingsFilePath}</Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
              <Info>Installed hooks:</Info>
              {RELAY_HOOKS.map((h) => (
                <Box key={h.event} marginLeft={2}>
                  <Text>
                    • {h.event}: {h.description}
                  </Text>
                </Box>
              ))}
              <Box marginTop={1}>
                <Text dimColor>
                  For notifications, we recommend <Text bold>peon-ping</Text> instead.
                </Text>
              </Box>
            </Box>
            <Box marginTop={1}>
              <Info>Uses the relay CLI directly, so all hooks auto-update with the package.</Info>
            </Box>
          </Box>
        </Section>,
      );
    } catch (error: unknown) {
      const err = error as Error;
      await this.renderApp(
        <Section title="Hooks Setup">
          <Box flexDirection="column">
            <ErrorBadge>Failed to install hooks</ErrorBadge>
            <Box marginTop={1}>
              <Text color="red">{err.message}</Text>
            </Box>
          </Box>
        </Section>,
      );
    }
  }
}
