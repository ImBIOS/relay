import { Flags } from "@oclif/core";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BaseCommand } from "../../oclif/base";
import { divider, ok, success, warn } from "../../utils/console";

const WRAPPER_MARKER = "# ── Relay Forge wrapper";

const FORGE_TOML_DIR = join(homedir(), "forge");
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

/** The single Relay provider block to inject into .forge.toml. */
const RELAY_PROVIDER_BLOCK = `
[[providers]]
id = "relay"
url = "http://127.0.0.1:8787/api/anthropic/v1/messages"
api_key_vars = "ANTHROPIC_AUTH_TOKEN"
url_param_vars = []
response_type = "Anthropic"
auth_methods = ["api_key"]

[[providers.models]]
id = "Relay"
name = "Relay"
description = "All models routed via Relay Proxy (Anthropic protocol)"
context_length = 204800
tools_supported = true
supports_parallel_tool_calls = true
supports_reasoning = true
input_modalities = ["text"]
`;

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
 * Remove every `[[providers]]` block (including its `[[providers.models]]` entries)
 * from the TOML content. Returns the cleaned content.
 */
function stripProviders(content: string): string {
  // Split on [[providers]] headers, keep everything before the first one
  const parts = content.split(/^\[\[providers\]\]$/m);
  return parts[0].trimEnd();
}

/**
 * Set a top-level string key=value in TOML content (e.g. `provider_id = "relay"`).
 */
function setTomlStringKey(content: string, key: string, value: string, section?: string): string {
  const escaped = value.replace(/["\\]/g, "\\$&");
  const dq = '"';

  if (section) {
    const keyRe = new RegExp("^" + key + '\\s*=\\s*"[^"]*"', "m");
    if (keyRe.test(content)) {
      return content.replace(keyRe, key + " = " + dq + escaped + dq);
    }
    const sectionRe = new RegExp("^\\[" + section + "\\]", "m");
    if (sectionRe.test(content)) {
      return content.replace(sectionRe, "[" + section + "]\n" + key + " = " + dq + escaped + dq);
    }
    return content + "\n[" + section + "]\n" + key + " = " + dq + escaped + dq + "\n";
  }

  const keyRe = new RegExp("^" + key + '\\s*=\\s*"[^"]*"', "m");
  if (keyRe.test(content)) {
    return content.replace(keyRe, key + " = " + dq + escaped + dq);
  }

  const firstSection = content.search(/^\[/m);
  if (firstSection !== -1) {
    return content.slice(0, firstSection) + key + " = " + dq + escaped + dq + "\n" + content.slice(firstSection);
  }
  return content + "\n" + key + " = " + dq + escaped + dq + "\n";
}
/**
 * Idempotently applies the Relay autonomy + provider settings to ~/forge/.forge.toml.
 * Returns true if any change was written.
 */
function applyForgeTomlSettings(): boolean {
  const tmpPath = `${FORGE_TOML_PATH}.tmp`;

  if (!existsSync(FORGE_TOML_DIR)) {
    mkdirSync(FORGE_TOML_DIR, { recursive: true });
  }

  let content = existsSync(FORGE_TOML_PATH) ? readFileSync(FORGE_TOML_PATH, "utf-8") : "";
  const original = content;

  // ── 1. Top-level numeric settings ──────────────────────────────────────
  for (const [k, v] of Object.entries(TOML_TOP_LEVEL)) {
    content = setTomlKey(content, k, v);
  }

  // ── 2. [retry] section ────────────────────────────────────────────────
  for (const [k, v] of Object.entries(TOML_RETRY)) {
    content = setTomlKey(content, k, v, "retry");
  }

  // ── 3. [session] — force provider_id and model_id ────────────────────
  content = setTomlStringKey(content, "provider_id", "relay", "session");
  content = setTomlStringKey(content, "model_id", "Relay", "session");

  // ── 4. Replace all [[providers]] blocks with single Relay provider ───
  content = stripProviders(content);
  content = content.trimEnd() + "\n" + RELAY_PROVIDER_BLOCK;

  if (content === original) return false;

  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, FORGE_TOML_PATH);
  return true;
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
    ${bin} hooks session-start --silent >/dev/null 2>&1
    trap "${bin} hooks forge-stop --silent >/dev/null 2>&1" EXIT
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

    // Apply autonomy + provider settings to ~/forge/.forge.toml so Forge
    // requires minimal human intervention and uses the relay proxy.
    const changed = applyForgeTomlSettings();
    if (changed) {
      console.log("");
      console.log(
        `  ${success("Applied")} settings to ${FORGE_TOML_PATH}:`,
      );
      console.log("    Provider: relay / Relay (single model)");
      console.log(`    max_requests_per_turn  = ${TOML_TOP_LEVEL.max_requests_per_turn}`);
      console.log(`    max_tool_failure_per_turn = ${TOML_TOP_LEVEL.max_tool_failure_per_turn}`);
      console.log(`    retry.max_attempts     = ${TOML_RETRY.max_attempts}`);
      console.log(`    retry.initial_backoff_ms = ${TOML_RETRY.initial_backoff_ms}`);
      console.log(`    retry.min_delay_ms     = ${TOML_RETRY.min_delay_ms}`);
    } else {
      console.log("");
      console.log(`  ${ok("Settings already up-to-date.")} (${FORGE_TOML_PATH})`);
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
