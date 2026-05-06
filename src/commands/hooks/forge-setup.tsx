#!/usr/bin/env bun
//===============================================================================
// ForgeCode Shell Wrapper
// Installs a shell wrapper function that runs `relay hooks forge-stop`
// after each `forge` session exits.
//===============================================================================

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Box, Text } from "ink";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../oclif/base";
import { Info, Section, Success, Warning } from "../../ui/index";

const FORGE_WRAPPER_FUNCTION = `# !! Relay ForgeCode wrapper - managed by 'relay hooks forge-setup' !!
# !! Do not edit manually - changes will be overwritten !!
# Wraps the 'forge' command to run auto-commit on session exit.
forge() {
  local _relay_exit_code
  command forge "$@"
  _relay_exit_code=$?
  # Print blank lines to prevent starship prompt from overwriting forge output
  echo; echo; echo
  if [ -n "$RELAY_FORGE_WRAPPER" ]; then
    relay hooks forge-stop --silent 2>/dev/null
  fi
  return $_relay_exit_code
}`;

const FORGE_WRAPPER_BASH = `# !! Relay ForgeCode wrapper - managed by 'relay hooks forge-setup' !!
# !! Do not edit manually - changes will be overwritten !!
# Wraps the 'forge' command to run auto-commit on session exit.
forge() {
  local _relay_exit_code
  command forge "$@"
  _relay_exit_code=$?
  # Print blank lines to prevent starship prompt from overwriting forge output
  echo; echo; echo
  if [ -n "$RELAY_FORGE_WRAPPER" ]; then
    relay hooks forge-stop --silent 2>/dev/null
  fi
  return $_relay_exit_code
}`;

function getShellConfigFiles(): string[] {
  const home = os.homedir();
  const files: string[] = [];

  // Zsh configs
  const zdotdir = process.env.ZDOTDIR || home;
  files.push(path.join(zdotdir, ".zshrc"));
  files.push(path.join(zdotdir, ".zprofile"));

  // Bash configs
  files.push(path.join(home, ".bashrc"));
  files.push(path.join(home, ".bash_profile"));
  files.push(path.join(home, ".profile"));

  return files;
}

function getMarker(): string {
  return "# !! Relay ForgeCode wrapper - managed by 'relay hooks forge-setup' !!";
}

function isWrapperInstalled(content: string): boolean {
  return content.includes(getMarker());
}

function removeWrapper(content: string): string {
  const lines = content.split("\n");
  const marker = getMarker();
  const filtered: string[] = [];
  let insideBlock = false;

  for (const line of lines) {
    if (line.includes(marker)) {
      insideBlock = !insideBlock;
      continue;
    }
    if (!insideBlock) {
      filtered.push(line);
    }
  }

  // Clean up consecutive blank lines
  return filtered.join("\n").replace(/\n{3,}/g, "\n\n");
}

function detectShell(): string {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  return "unknown";
}

export default class HooksForgeSetup extends BaseCommand<typeof HooksForgeSetup> {
  static description = "Install ForgeCode shell wrapper for auto-commit on session end";

  static examples = [
    "<%= config.bin %> hooks forge-setup",
    "<%= config.bin %> hooks forge-setup --uninstall",
  ];

  static flags = {
    uninstall: Flags.boolean({
      description: "Remove the forge wrapper from shell config",
      default: false,
    }),
    silent: Flags.boolean({
      description: "Run silently without output",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(HooksForgeSetup);

    if (flags.uninstall) {
      await this.uninstall(flags.silent);
      return;
    }

    await this.install(flags.silent);
  }

  private async install(silent: boolean): Promise<void> {
    const shell = detectShell();
    const configFiles = getShellConfigFiles();
    const wrapper = shell === "bash" ? FORGE_WRAPPER_BASH : FORGE_WRAPPER_FUNCTION;

    let installed = false;

    for (const configFile of configFiles) {
      if (!fs.existsSync(configFile)) continue;

      let content = fs.readFileSync(configFile, "utf-8");

      if (isWrapperInstalled(content)) {
        if (!silent) {
          console.log(`[relay] Wrapper already installed in ${configFile}`);
        }
        installed = true;
        continue;
      }

      // Add the wrapper function
      content = content.trimEnd() + "\n\n" + wrapper + "\n";
      fs.writeFileSync(configFile, content);
      installed = true;

      if (!silent) {
        console.log(`[relay] ForgeCode wrapper installed in ${configFile}`);
      }
      break; // Only install in the first existing config file
    }

    if (!installed && !silent) {
      // Try to create .zshrc if it doesn't exist
      const home = os.homedir();
      const zshrc = path.join(process.env.ZDOTDIR || home, ".zshrc");
      const wrapper = shell === "bash" ? FORGE_WRAPPER_BASH : FORGE_WRAPPER_FUNCTION;
      fs.writeFileSync(zshrc, wrapper + "\n");
      console.log(`[relay] Created ${zshrc} with ForgeCode wrapper`);
      installed = true;
    }

    if (installed && !silent) {
      console.log("[relay] Set RELAY_FORGE_WRAPPER=1 in your shell to enable auto-commit");
      console.log("[relay] Example: export RELAY_FORGE_WRAPPER=1");
    }

    if (!silent) {
      await this.renderApp(
        <Section title="ForgeCode Auto-Commit Setup">
          <Box flexDirection="column">
            <Success>Shell wrapper installed</Success>
            <Box marginTop={1}>
              <Info>
                The wrapper intercepts the <Text bold>forge</Text> command and runs auto-commit
                after each session.
              </Info>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>To enable: export RELAY_FORGE_WRAPPER=1</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>To uninstall: relay hooks forge-setup --uninstall</Text>
            </Box>
          </Box>
        </Section>,
      );
    }
  }

  private async uninstall(silent: boolean): Promise<void> {
    const configFiles = getShellConfigFiles();
    let removed = false;

    for (const configFile of configFiles) {
      if (!fs.existsSync(configFile)) continue;

      let content = fs.readFileSync(configFile, "utf-8");

      if (isWrapperInstalled(content)) {
        content = removeWrapper(content);
        fs.writeFileSync(configFile, content);
        removed = true;

        if (!silent) {
          console.log(`[relay] Removed wrapper from ${configFile}`);
        }
      }
    }

    if (!removed && !silent) {
      console.log("[relay] No ForgeCode wrapper found in shell config files.");
    }

    if (!silent) {
      await this.renderApp(
        <Section title="ForgeCode Auto-Commit Uninstall">
          <Box flexDirection="column">
            {removed ? (
              <Success>Wrapper removed from shell config</Success>
            ) : (
              <Warning>No wrapper found</Warning>
            )}
            <Box marginTop={1}>
              <Text dimColor>
                You can also unset RELAY_FORGE_WRAPPER to disable without removing.
              </Text>
            </Box>
          </Box>
        </Section>,
      );
    }
  }
}
