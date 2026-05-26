import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { divider, ok, success, warn } from "../../utils/console";

const WRAPPER_MARKER = "# ── Relay Forge wrapper";

const FORGE_TOML_DIR = join(homedir(), ".forge");
const FORGE_TOML_PATH = join(FORGE_TOML_DIR, ".forge.toml");

/** Top-level keys to apply (key → value). */
const TOML_TOP_LEVEL: Record<string, number> = {
  max_requests_per_turn: 10000,
  max_tool_failure_per_turn: 200,
};

/** Keys to apply inside the [retry] section. */
const TOML_RETRY: Record<string, number> = {
  initial_backoff_ms: 100,
  min_delay_ms: 500,
  max_attempts: 100,
};

/**
 * Replace or insert a key=value pair in a TOML string.
 * When `section` is given the key is scoped to that section header.
 */
function setTomlKey(content: string, key: string, value: number, section?: string): string {
  if (section) {
    const keyRe = new RegExp(`^(${key}\\s*=\\s*)\\S+`, "m");
    if (keyRe.test(content)) {
      return content.replace(keyRe, `${key} = ${value}`);
    }
    const sectionRe = new RegExp(`^\\[${section}\\]`, "m");
    if (sectionRe.test(content)) {
      return content.replace(sectionRe, `[${section}]\n${key} = ${value}`);
    }
    return `${content}\n[${section}]\n${key} = ${value}\n`;
  }

  const keyRe = new RegExp(`^(${key}\\s*=\\s*)\\S+`, "m");
  if (keyRe.test(content)) {
    return content.replace(keyRe, `${key} = ${value}`);
  }

  const firstSection = content.search(/^\[/m);
  if (firstSection !== -1) {
    return content.slice(0, firstSection) + `${key} = ${value}\n` + content.slice(firstSection);
  }
  return `${content}\n${key} = ${value}\n`;
}

/**
 * Idempotently applies the Relay autonomy settings to ~/.forge/.forge.toml.
 * Returns the number of keys that were actually changed.
 */
function applyForgeTomlSettings(): number {
  const tmpPath = `${FORGE_TOML_PATH}.tmp`;

  if (!existsSync(FORGE_TOML_DIR)) {
    mkdirSync(FORGE_TOML_DIR, { recursive: true });
  }

  let content = existsSync(FORGE_TOML_PATH) ? readFileSync(FORGE_TOML_PATH, "utf-8") : "";
  const original = content;

  for (const [k, v] of Object.entries(TOML_TOP_LEVEL)) {
    content = setTomlKey(content, k, v);
  }
  for (const [k, v] of Object.entries(TOML_RETRY)) {
    content = setTomlKey(content, k, v, "retry");
  }

  if (content === original) return 0;

  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, FORGE_TOML_PATH);

  return Object.keys(TOML_TOP_LEVEL).length + Object.keys(TOML_RETRY).length;
}
const WRAPPER_BODY = (bin: string) => `
${WRAPPER_MARKER}
forge() {
  if [[ -n "\${FORGE_PROXY_SET:-}" ]]; then
    command forge "$@"
  else
    export FORGE_PROXY_SET=1
    unset FORGE_SESSION__PROVIDER_ID FORGE_SESSION__MODEL_ID
    export ANTHROPIC_BASE_URL="\${ANTHROPIC_BASE_URL:-http://127.0.0.1:8787}"
    export ANTHROPIC_AUTH_TOKEN="\${ANTHROPIC_AUTH_TOKEN:-relay}"
    ${bin} hooks session-start --silent
    trap "${bin} hooks forge-stop --silent" EXIT
    command forge "$@"
  fi
}
`;

function getRcFile(shell: string): string {
  const home = homedir();
  if (shell === "zsh") return join(home, ".zshrc");
  if (shell === "fish") return join(home, ".config/fish/config.fish");
  return join(home, ".bashrc");
}

export default class ForgeSetup extends BaseCommand<typeof ForgeSetup> {
  static description = "Install/uninstall the forge() shell wrapper";
  static flags = {
    uninstall: Flags.boolean({ description: "Remove the wrapper" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ForgeSetup);
    const shell = process.env.SHELL?.split("/").pop() ?? "bash";
    const rc = getRcFile(shell);
    const bin = "relay";

    console.log("");
    console.log(divider("─", 50));
    if (flags.uninstall) {
      await this.uninstall(rc);
    } else {
      await this.install(rc, bin);
    }
  }

  private async install(rc: string, bin: string): Promise<void> {
    if (!existsSync(rc)) {
      console.log(`  ${warn("Warning:")} ${rc} does not exist.`);
      console.log(`  Create it and re-run, or add manually:`);
      console.log(WRAPPER_BODY(bin));
      return;
    }

    const content = readFileSync(rc, "utf-8");
    if (content.includes(WRAPPER_MARKER)) {
      console.log(`  ${ok("Already installed.")}`);
    } else {
      writeFileSync(rc, content + "\n" + WRAPPER_BODY(bin), "utf-8");
      console.log(`  ${success("Installed!")} Shell wrapper added to ${rc}`);
      console.log("  Restart your shell or run: source " + rc);
      console.log("");
      console.log("  After sourcing, use `forge` instead of `claude`:");
      console.log("  $ forge");
    }

    // Apply autonomy settings to ~/.forge/.forge.toml so Forge requires
    // minimal human intervention (higher turn limits, more retry attempts).
    const changed = applyForgeTomlSettings();
    if (changed > 0) {
      console.log("");
      console.log(
        `  ${success("Applied")} autonomy settings to ${FORGE_TOML_PATH}:`,
      );
      console.log(`    max_requests_per_turn  = ${TOML_TOP_LEVEL.max_requests_per_turn}`);
      console.log(`    max_tool_failure_per_turn = ${TOML_TOP_LEVEL.max_tool_failure_per_turn}`);
      console.log(`    retry.max_attempts     = ${TOML_RETRY.max_attempts}`);
      console.log(`    retry.initial_backoff_ms = ${TOML_RETRY.initial_backoff_ms}`);
      console.log(`    retry.min_delay_ms     = ${TOML_RETRY.min_delay_ms}`);
    } else {
      console.log("");
      console.log(`  ${ok("Autonomy settings already up-to-date.")} (${FORGE_TOML_PATH})`);
    }
  }

  private async uninstall(rc: string): Promise<void> {
    if (!existsSync(rc)) {
      console.log(`  ${warn("Not found:")} ${rc}`);
      return;
    }

    const content = readFileSync(rc, "utf-8");
    const markerIdx = content.indexOf(WRAPPER_MARKER);
    if (markerIdx === -1) {
      console.log(`  ${warn("Not installed.")} No relay wrapper found in ${rc}.`);
      return;
    }

    const before = content.slice(0, markerIdx).trimEnd();
    const after = content.slice(markerIdx).split("\n").slice(1).join("\n").trimStart();
    writeFileSync(rc, (before + "\n" + after).trimEnd() + "\n", "utf-8");
    console.log(`  ${ok("Removed.")} Shell wrapper removed from ${rc}`);
    console.log("  Restart your shell or run: source " + rc);
  }
}
