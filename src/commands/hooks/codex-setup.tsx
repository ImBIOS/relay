import { Flags } from "@oclif/core";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BaseCommand } from "../../oclif/base";
import { divider, ok, success, warn } from "../../utils/console";

const WRAPPER_MARKER = "# ── Relay Codex wrapper";

const CODEX_CONFIG_DIR = join(homedir(), ".codex");
const CODEX_CONFIG_PATH = join(CODEX_CONFIG_DIR, "config.toml");

/** Codex CLI config content — routes through relay proxy. */
const CODEX_CONFIG_TOML = `model = "gpt-4.1"
provider = "openai"
`;

const WRAPPER_BODY = (bin: string) => `
${WRAPPER_MARKER}
codex() {
  if [[ -n "\${CODEX_PROXY_SET:-}" ]]; then
    command codex "$@"
  else
    export CODEX_PROXY_SET=1
    export OPENAI_API_KEY="\${OPENAI_API_KEY:-relay}"
    export OPENAI_BASE_URL="\${OPENAI_BASE_URL:-http://127.0.0.1:8787/api/openai/v1}"
    ${bin} hooks session-start --silent >/dev/null 2>&1
    trap "${bin} hooks codex-stop --silent >/dev/null 2>&1" EXIT
    command codex "$@"
  fi
}
`;

function getRcFile(shell: string): string {
  const home = homedir();
  if (shell === "zsh") return join(home, ".zshrc");
  if (shell === "fish") return join(home, ".config/fish/config.fish");
  return join(home, ".bashrc");
}

/**
 * Idempotently writes ~/.codex/config.toml with relay proxy settings.
 * Uses atomic write (tmp + rename) per project conventions.
 * Returns true if the file was created or updated.
 */
function applyCodexConfig(): boolean {
  const tmpPath = `${CODEX_CONFIG_PATH}.tmp`;

  if (!existsSync(CODEX_CONFIG_DIR)) {
    mkdirSync(CODEX_CONFIG_DIR, { recursive: true });
  }

  const existing = existsSync(CODEX_CONFIG_PATH)
    ? readFileSync(CODEX_CONFIG_PATH, "utf-8")
    : "";

  if (existing === CODEX_CONFIG_TOML) return false;

  writeFileSync(tmpPath, CODEX_CONFIG_TOML, "utf-8");
  renameSync(tmpPath, CODEX_CONFIG_PATH);
  return true;
}

export default class CodexSetup extends BaseCommand<typeof CodexSetup> {
  static description = "Install/uninstall the codex() shell wrapper for OpenAI Codex CLI";
  static flags = {
    uninstall: Flags.boolean({ description: "Remove the wrapper" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CodexSetup);
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
      console.log("  After sourcing, use `codex` as usual:");
      console.log("  $ codex");
    }

    // Apply Codex CLI config to ~/.codex/config.toml so it routes through
    // the relay proxy.
    const changed = applyCodexConfig();
    if (changed) {
      console.log("");
      console.log(
        `  ${success("Applied")} settings to ${CODEX_CONFIG_PATH}:`,
      );
      console.log(`    model    = gpt-4.1`);
      console.log(`    provider = openai`);
      console.log(`    OPENAI_BASE_URL = http://127.0.0.1:8787/api/openai/v1`);
    } else {
      console.log("");
      console.log(`  ${ok("Settings already up-to-date.")} (${CODEX_CONFIG_PATH})`);
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
      console.log(`  ${warn("Not installed.")} No relay codex wrapper found in ${rc}.`);
      return;
    }

    const before = content.slice(0, markerIdx).trimEnd();
    const after = content.slice(markerIdx).split("\n").slice(1).join("\n").trimStart();
    writeFileSync(rc, (before + "\n" + after).trimEnd() + "\n", "utf-8");
    console.log(`  ${ok("Removed.")} Shell wrapper removed from ${rc}`);
    console.log("  Restart your shell or run: source " + rc);
  }
}
