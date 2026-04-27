import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { error, info, section, success, warning } from "../../utils/logger";

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
}

interface ClaudeSettings {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

const FORGE_WRAPPER_MARKER =
  "# !! Relay ForgeCode wrapper - managed by 'relay hooks forge-setup' !!";

function getShellConfigFiles(): string[] {
  const home = os.homedir();
  const zdotdir = process.env.ZDOTDIR || home;
  return [
    path.join(zdotdir, ".zshrc"),
    path.join(zdotdir, ".zprofile"),
    path.join(home, ".bashrc"),
    path.join(home, ".bash_profile"),
    path.join(home, ".profile"),
  ];
}

function checkForgeWrapperInstalled(): boolean {
  for (const configFile of getShellConfigFiles()) {
    if (fs.existsSync(configFile)) {
      const content = fs.readFileSync(configFile, "utf-8");
      if (content.includes(FORGE_WRAPPER_MARKER)) {
        return true;
      }
    }
  }
  return false;
}

function removeForgeWrapper(): boolean {
  let removed = false;
  for (const configFile of getShellConfigFiles()) {
    if (!fs.existsSync(configFile)) continue;

    let content = fs.readFileSync(configFile, "utf-8");
    if (!content.includes(FORGE_WRAPPER_MARKER)) continue;

    const lines = content.split("\n");
    const filtered: string[] = [];
    let insideBlock = false;

    for (const line of lines) {
      if (line.includes(FORGE_WRAPPER_MARKER)) {
        insideBlock = !insideBlock;
        continue;
      }
      if (!insideBlock) {
        filtered.push(line);
      }
    }

    content = filtered.join("\n").replace(/\n{3,}/g, "\n\n");
    fs.writeFileSync(configFile, content);
    removed = true;
  }
  return removed;
}

export async function handleHooksSetup(): Promise<void> {
  const claudeSettingsPath = path.join(os.homedir(), ".claude");
  const settingsFilePath = path.join(claudeSettingsPath, "settings.json");

  // Hook commands - using relay CLI directly for auto-updates
  const sessionStartCommand = "relay auto hook --silent";
  const postToolCommand = "relay hooks post-tool --silent";
  const stopCommand = "relay hooks stop"; // No --silent to enable sounds

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

    // Install SessionStart hook (auto-rotate)
    if (!settings.hooks.SessionStart) {
      settings.hooks.SessionStart = [];
    }
    const sessionStartExists = settings.hooks.SessionStart.some((hookGroup) =>
      hookGroup.hooks.some(
        (hookConfig) =>
          hookConfig.type === "command" &&
          hookConfig.command &&
          (hookConfig.command === sessionStartCommand ||
            hookConfig.command.includes("auto hook") ||
            hookConfig.command.includes("auto-rotate.sh")),
      ),
    );
    if (sessionStartExists) {
      hooksSkipped++;
    } else {
      settings.hooks.SessionStart.push({
        matcher: "startup|resume|clear|compact",
        hooks: [
          {
            type: "command",
            command: sessionStartCommand,
          },
        ],
      });
      hooksInstalled++;
    }

    // Install PostToolUse hook (format files)
    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = [];
    }
    const postToolExists = settings.hooks.PostToolUse.some((hookGroup) =>
      hookGroup.hooks.some(
        (hookConfig) =>
          hookConfig.type === "command" &&
          hookConfig.command &&
          hookConfig.command.includes("hooks post-tool"),
      ),
    );
    if (postToolExists) {
      hooksSkipped++;
    } else {
      settings.hooks.PostToolUse.push({
        matcher: "Write|Edit",
        hooks: [
          {
            type: "command",
            command: postToolCommand,
          },
        ],
      });
      hooksInstalled++;
    }

    // Install Stop hook (commit prompt)
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [];
    }
    const stopExists = settings.hooks.Stop.some((hookGroup) =>
      hookGroup.hooks.some(
        (hookConfig) =>
          hookConfig.type === "command" &&
          hookConfig.command &&
          hookConfig.command.includes("hooks stop"),
      ),
    );
    if (stopExists) {
      hooksSkipped++;
    } else {
      settings.hooks.Stop.push({
        hooks: [
          {
            type: "command",
            command: stopCommand,
          },
        ],
      });
      hooksInstalled++;
    }

    // Write updated settings
    fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));

    section("Hooks Setup");
    success(`Installed ${hooksInstalled} Claude Code hook(s), ${hooksSkipped} already present.`);
    info(`Settings location: ${settingsFilePath}`);
    info("");
    info("Installed Claude Code hooks:");
    info("  • SessionStart: Auto-rotate API keys on startup");
    info("  • PostToolUse: Format files after Write|Edit");
    info("  • Stop: Commit prompt on session end");
    info("");
    info("For ForgeCode auto-commit, run 'relay hooks forge-setup'.");
    info("");
    info("For notifications, we recommend peon-ping.");
    info("");
    info("Uses the relay CLI directly, so all hooks auto-update with the package.");
  } catch (err: any) {
    section("Hooks Setup");
    error("Failed to install hooks");
    error(err.message);
  }
}

export async function handleHooksUninstall(): Promise<void> {
  const settingsFilePath = path.join(os.homedir(), ".claude", "settings.json");
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

    // Update settings.json to remove all relay hooks
    if (fs.existsSync(settingsFilePath)) {
      const content = fs.readFileSync(settingsFilePath, "utf-8");
      let settings: ClaudeSettings;

      try {
        settings = JSON.parse(content) as ClaudeSettings;
      } catch {
        settings = {};
      }

      const hookTypes = ["SessionStart", "PostToolUse", "Stop"] as const;

      for (const hookType of hookTypes) {
        if (settings.hooks?.[hookType]) {
          const originalLength = settings.hooks[hookType].length;

          settings.hooks[hookType] = settings.hooks[hookType].filter((hookGroup) => {
            if (!(hookGroup.hooks && Array.isArray(hookGroup.hooks))) {
              return true;
            }

            const hasOurHook = hookGroup.hooks.some((hookConfig) => {
              if (hookConfig.type !== "command" || !hookConfig.command) {
                return false;
              }

              const cmd = hookConfig.command;
              return (
                cmd === hookScriptPath ||
                cmd.includes("auto-rotate.sh") ||
                cmd.includes("auto hook") ||
                cmd === "relay auto hook --silent" ||
                cmd.includes("hooks post-tool") ||
                cmd.includes("hooks stop")
              );
            });

            return !hasOurHook;
          });

          if (settings.hooks[hookType].length !== originalLength) {
            hooksRemoved += originalLength - settings.hooks[hookType].length;
            settingsModified = true;

            // Clean up empty arrays
            if (settings.hooks[hookType].length === 0) {
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

    // Remove ForgeCode shell wrapper
    const forgeWrapperRemoved = removeForgeWrapper();

    section("Hooks Uninstall");

    if (!(hookRemoved || settingsModified || forgeWrapperRemoved)) {
      info("No relay hooks found.");
      info("Hooks may have already been removed or were never installed.");
      return;
    }

    const parts: string[] = [];
    if (hooksRemoved > 0) parts.push(`${hooksRemoved} Claude Code hook(s)`);
    if (forgeWrapperRemoved) parts.push("ForgeCode wrapper");
    success(`Removed ${parts.join(" and ")}.`);

    if (hookRemoved) {
      info("Removed legacy hook script");
    }
    if (settingsModified) {
      info(`Updated Claude settings: ${settingsFilePath}`);
    }
    if (forgeWrapperRemoved) {
      info("Removed ForgeCode shell wrapper");
    }

    info("");
    info("Auto-rotation, formatting, and commit prompts are no longer automatic.");
    info("For notifications, use peon-ping instead.");
    info("To re-enable Claude Code hooks, run 'relay hooks setup'.");
    if (forgeWrapperRemoved) {
      info("To re-enable ForgeCode auto-commit, run 'relay hooks forge-setup'.");
    }
  } catch (err: any) {
    section("Hooks Uninstall");
    error("Failed to uninstall hooks");
    error(err.message);
  }
}

export async function handleHooksStatus(): Promise<void> {
  const settingsFilePath = path.join(os.homedir(), ".claude", "settings.json");
  const hooksDir = path.join(os.homedir(), ".claude", "hooks");
  const hookScriptPath = path.join(hooksDir, "auto-rotate.sh");

  const scriptExists = fs.existsSync(hookScriptPath);
  const scriptExecutable = scriptExists && (fs.statSync(hookScriptPath).mode & 0o755) !== 0;

  interface HookStatus {
    name: string;
    command: string;
    registered: boolean;
    hookType: string;
  }

  const hooks: HookStatus[] = [
    {
      name: "SessionStart",
      command: "relay auto hook --silent",
      registered: false,
      hookType: "auto-rotate",
    },
    {
      name: "PostToolUse",
      command: "relay hooks post-tool --silent",
      registered: false,
      hookType: "format",
    },
    {
      name: "Stop",
      command: "relay hooks stop",
      registered: false,
      hookType: "commit",
    },
  ];

  let settingsFound = false;
  let rotationEnabled = false;
  let rotationStrategy = "unknown";

  if (fs.existsSync(settingsFilePath)) {
    try {
      const content = fs.readFileSync(settingsFilePath, "utf-8");
      const settings = JSON.parse(content) as ClaudeSettings;
      settingsFound = true;

      for (const hook of hooks) {
        if (settings.hooks?.[hook.name as keyof HooksConfig]) {
          settings.hooks[hook.name as keyof HooksConfig]?.forEach((hookGroup) => {
            if (hookGroup.hooks && Array.isArray(hookGroup.hooks)) {
              hookGroup.hooks.forEach((hookConfig) => {
                if (
                  hookConfig.type === "command" &&
                  hookConfig.command &&
                  (hookConfig.command.includes(hook.command.split(" ")[1]) ||
                    hookConfig.command.includes(hook.hookType))
                ) {
                  hook.registered = true;
                }
              });
            }
          });
        }
      }
    } catch {
      // Invalid JSON
    }
  }

  // Check rotation config
  const configPath = path.join(os.homedir(), ".claude", "imbios.json");
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(configContent);
      rotationEnabled = config.rotation?.enabled ?? false;
      rotationStrategy = config.rotation?.strategy ?? "unknown";
    } catch {
      // Invalid JSON
    }
  }

  const allHooksInstalled = hooks.every((h) => h.registered);
  const someHooksInstalled = hooks.some((h) => h.registered);
  const forgeWrapperInstalled = checkForgeWrapperInstalled();

  section("Hooks Status");

  console.log("Claude Code:");
  console.log(
    `  Overall: ${allHooksInstalled ? "✓ All Installed" : someHooksInstalled ? "⚠ Partial" : "✗ Not Installed"}`,
  );

  console.log("");
  console.log("  Installed Hooks:");
  for (const hook of hooks) {
    const status = hook.registered ? "✓" : "○";
    const typeLabel = {
      "auto-rotate": "Auto-rotate",
      format: "Format files",
      commit: "Commit prompt",
    }[hook.hookType];
    console.log(`    ${status} ${hook.name}: ${typeLabel}`);
    if (hook.registered) {
      console.log(`      ${hook.command}`);
    }
  }

  console.log("");
  console.log(
    `  Legacy Hook Script: ${scriptExists ? (scriptExecutable ? "✓ Found" : "⚠ Not Executable") : "○ Not Found"}`,
  );
  if (scriptExists) {
    console.log(`    ${hookScriptPath}`);
  }

  console.log("");
  console.log(`  Registered in Settings: ${settingsFound ? "✓ Yes" : "✗ No"}`);
  if (settingsFound && !someHooksInstalled) {
    console.log(`    ${settingsFilePath}`);
  }

  console.log("");
  console.log(`  Rotation Enabled: ${rotationEnabled ? "✓ Yes" : "○ No"}`);
  console.log(`  Rotation Strategy: ${rotationStrategy}`);

  console.log("");
  console.log("ForgeCode:");
  console.log(`  Shell Wrapper: ${forgeWrapperInstalled ? "✓ Installed" : "✗ Not Installed"}`);
  if (forgeWrapperInstalled) {
    console.log("    Run 'relay hooks forge-setup --uninstall' to remove");
  } else {
    console.log("    Run 'relay hooks forge-setup' to enable auto-commit");
  }

  console.log("");
  if (!allHooksInstalled) {
    warning(`Run 'relay hooks setup' to install missing Claude Code hooks.`);
  } else if (rotationEnabled) {
    success("All Claude Code hooks are installed and rotation is enabled!");
  } else {
    warning("Claude Code hooks installed but rotation is disabled. Run 'relay auto enable'.");
  }
  if (!forgeWrapperInstalled) {
    info("Run 'relay hooks forge-setup' to enable ForgeCode auto-commit.");
  }
}
