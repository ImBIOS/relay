#!/usr/bin/env bun
//===============================================================================
// Global Multi-Language Code Formatter
// Primary: Biome (JS/TS/JSX/JSON/CSS/GraphQL)
// Fallbacks: Language-specific formatters for other languages
//===============================================================================

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { Flags } from "@oclif/core";
import { Box, Text } from "ink";
import { BaseCommand } from "../../oclif/base";
import { Info, Section, Success, Warning } from "../../ui/index";

interface FormatOptions {
  silent: boolean;
  verbose: boolean;
  all: boolean;
}

interface FormatResult {
  file: string;
  success: boolean;
  formatted: boolean;
}

// Module-level cache for command availability — survives across formatFile calls
const commandCache = new Map<string, boolean>();

function hasCommand(cmd: string): boolean {
  const cached = commandCache.get(cmd);
  if (cached !== undefined) return cached;

  // Bun.which() is sync and doesn't spawn a process
  const found = Bun.which(cmd) !== null;
  commandCache.set(cmd, found);
  return found;
}

async function runCommand(
  cmd: string,
  args: string[],
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (data) => (stdout += data.toString()));
    proc.stderr.on("data", (data) => (stderr += data.toString()));
    proc.on("close", (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
    proc.on("error", () => {
      resolve({ success: false, stdout, stderr });
    });
  });
}

async function formatBiome(file: string): Promise<boolean> {
  if (!hasCommand("biome")) return false;
  const result = await runCommand("biome", ["format", "--write", file]);
  return result.success;
}

async function formatJson(file: string): Promise<boolean> {
  if (!hasCommand("jq")) return false;
  const tmpFile = `${file}.tmp_${Date.now()}`;
  try {
    fs.writeFileSync(tmpFile, fs.readFileSync(file));
    const result = await runCommand("jq", [".", "-o", tmpFile, file]);
    if (result.success) {
      fs.renameSync(tmpFile, file);
      return true;
    }
    if (existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  } catch {
    if (existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
  return false;
}

async function formatGo(file: string): Promise<boolean> {
  if (!hasCommand("gofmt")) return false;
  const result = await runCommand("gofmt", ["-w", file]);
  return result.success;
}

async function formatRust(file: string): Promise<boolean> {
  if (!hasCommand("rustfmt")) return false;
  const result = await runCommand("rustfmt", [file]);
  return result.success;
}

async function formatPython(file: string): Promise<boolean> {
  let formatted = false;
  if (hasCommand("black")) {
    await runCommand("black", [file]);
    formatted = true;
  }
  if (hasCommand("isort")) {
    await runCommand("isort", ["--quiet", file]);
    formatted = true;
  }
  return formatted;
}

async function formatCpp(file: string): Promise<boolean> {
  if (!hasCommand("clang-format")) return false;
  const result = await runCommand("clang-format", ["-i", file]);
  return result.success;
}

async function formatShell(file: string): Promise<boolean> {
  if (!hasCommand("shfmt")) return false;
  const result = await runCommand("shfmt", ["-w", "-i", "2", file]);
  return result.success;
}

async function formatPrettier(file: string): Promise<boolean> {
  if (!hasCommand("prettier")) return false;
  const result = await runCommand("prettier", ["--write", file]);
  return result.success;
}

async function formatYq(file: string): Promise<boolean> {
  if (!hasCommand("yq")) return false;
  const result = await runCommand("yq", ["eval", "-i", file]);
  return result.success;
}

async function formatTaplo(file: string): Promise<boolean> {
  if (!hasCommand("taplo")) return false;
  const result = await runCommand("taplo", ["fmt", file]);
  return result.success;
}

async function formatFile(file: string): Promise<FormatResult> {
  if (!existsSync(file)) {
    return { file, success: false, formatted: false };
  }

  const filename = path.basename(file);
  if (filename.startsWith(".") && filename !== ".Biome") {
    return { file, success: true, formatted: false };
  }

  const ext = path.extname(file).slice(1).toLowerCase();
  const base = path.basename(file, path.extname(file));
  if (ext === base) {
    return { file, success: true, formatted: false };
  }

  let formatted = false;
  let success = true;

  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
    case "ts":
    case "mts":
    case "cts":
    case "jsx":
    case "tsx":
    case "json":
    case "jsonc":
    case "json5":
    case "css":
    case "scss":
    case "sass":
    case "less":
    case "gql":
    case "graphql": {
      if (await formatBiome(file)) {
        formatted = true;
      } else if (ext.startsWith("json")) {
        await formatJson(file);
      }
      break;
    }
    case "html":
    case "htm":
    case "xhtml":
    case "md":
    case "markdown": {
      if (await formatPrettier(file)) {
        formatted = true;
      }
      break;
    }
    case "go": {
      if (await formatGo(file)) {
        formatted = true;
      }
      break;
    }
    case "rs": {
      if (await formatRust(file)) {
        formatted = true;
      }
      break;
    }
    case "py":
    case "pyi": {
      if (await formatPython(file)) {
        formatted = true;
      }
      break;
    }
    case "c":
    case "cpp":
    case "cxx":
    case "cc":
    case "h":
    case "hpp":
    case "hxx":
    case "m":
    case "mm": {
      if (await formatCpp(file)) {
        formatted = true;
      }
      break;
    }
    case "sh":
    case "bash":
    case "zsh":
    case "fish": {
      if (await formatShell(file)) {
        formatted = true;
      }
      break;
    }
    case "yaml":
    case "yml": {
      if (await formatYq(file)) {
        formatted = true;
      }
      break;
    }
    case "toml": {
      if (await formatTaplo(file)) {
        formatted = true;
      }
      break;
    }
    default: {
      success = true;
    }
  }

  return { file, success, formatted };
}

function extractFilePathFromInput(input: string): string | null {
  try {
    const data = JSON.parse(input);
    if (data.file_path) return data.file_path;
    if (data.path) return data.path;
    if (data.file) return data.file;
    if (data.destination) return data.destination;
    if (data.target) return data.target;
    if (data.tool_input) {
      const toolInput =
        typeof data.tool_input === "string" ? JSON.parse(data.tool_input) : data.tool_input;
      if (toolInput.file_path) return toolInput.file_path;
      if (toolInput.path) return toolInput.path;
      if (toolInput.file) return toolInput.file;
      if (toolInput.destination) return toolInput.destination;
      if (toolInput.target) return toolInput.target;
    }
  } catch {
    // Not JSON or doesn't contain expected fields
  }
  return null;
}

export default class PostTool extends BaseCommand<typeof PostTool> {
  static description = "Format files after Write|Edit operations (PostToolUse hook)";

  static examples = [
    "<%= config.bin %> hooks post-tool --verbose src/file.ts",
    "<%= config.bin %> hooks post-tool --all",
    "relay hooks post-tool --silent < input.json",
  ];

  static flags = {
    silent: Flags.boolean({
      description: "Run silently without output",
    }),
    verbose: Flags.boolean({
      description: "Show detailed output",
    }),
    all: Flags.boolean({
      description: "Format all files in current directory",
    }),
  };

  async run(): Promise<void> {
    // Skip when running inside a hook-spawned claude -p (recursion guard)
    if (process.env.RELAY_IN_HOOK === "1") {
      return;
    }

    const { flags } = await this.parse(PostTool);
    const options: FormatOptions = {
      silent: flags.silent ?? false,
      verbose: flags.verbose ?? false,
      all: flags.all ?? false,
    };

    const files: string[] = [];

    // Collect files from arguments or stdin
    if (this.argv.length > 0) {
      for (const arg of this.argv) {
        if (!arg.startsWith("-")) {
          files.push(arg);
        }
      }
    }

    // If no files from args and not --all, read from stdin
    if (files.length === 0 && !options.all) {
      const stdin = fs.readFileSync("/dev/stdin", "utf-8");
      const filePath = extractFilePathFromInput(stdin);
      if (filePath && existsSync(filePath)) {
        files.push(filePath);
      }
    }

    // If --all flag, find all files in current directory
    if (options.all) {
      const entries = fs.readdirSync(".", { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && !entry.name.startsWith(".")) {
          files.push(entry.name);
        }
      }
    }

    if (files.length === 0) {
      if (!options.silent) {
        await this.renderApp(
          <Section title="Post-Tool Format">
            <Info>No files to format.</Info>
            <Box marginTop={1}>
              <Text dimColor>Usage: relay hooks post-tool [--verbose] [--all] [files...]</Text>
            </Box>
          </Section>,
        );
      }
      return;
    }

    // Format all files
    const results: FormatResult[] = [];
    for (const file of files) {
      const result = await formatFile(file);
      results.push(result);
    }

    const formattedCount = results.filter((r) => r.formatted).length;
    const errorCount = results.filter((r) => !r.success).length;

    // Play sound after formatting completes (if any files were formatted)
    if (formattedCount > 0) {
    }

    if (!options.silent) {
      await this.renderApp(
        <Section title="Post-Tool Format">
          <Box flexDirection="column">
            {options.verbose &&
              results.map((r) => (
                <Box key={r.file}>
                  {r.formatted ? (
                    <Success>{r.file}</Success>
                  ) : r.success ? (
                    <Text color="gray">{r.file}</Text>
                  ) : (
                    <Warning>{r.file}</Warning>
                  )}
                </Box>
              ))}
            <Box marginTop={1}>
              <Text>
                Formatted:{" "}
                <Text bold color="green">
                  {formattedCount}
                </Text>{" "}
                file(s)
              </Text>
            </Box>
            {errorCount > 0 && (
              <Box marginTop={1}>
                <Text color="yellow">{errorCount} file(s) could not be formatted</Text>
              </Box>
            )}
          </Box>
        </Section>,
      );
    }
  }
}
