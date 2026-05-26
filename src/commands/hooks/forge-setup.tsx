import { BaseCommand } from "../../oclif/base";
import { Flags } from "@oclif/core";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { divider, ok, success, warn } from "../../utils/console";

const WRAPPER_MARKER = "# ── Relay Forge wrapper";
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
      return;
    }

    writeFileSync(rc, content + "\n" + WRAPPER_BODY(bin), "utf-8");
    console.log(`  ${success("Installed!")} Shell wrapper added to ${rc}`);
    console.log("  Restart your shell or run: source " + rc);
    console.log("");
    console.log("  After sourcing, use `forge` instead of `claude`:");
    console.log("  $ forge");
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
