import type { Plugin } from "./types.js";

const extMap: Record<string, string> = {
  js: "oxfmt",
  mjs: "oxfmt",
  cjs: "oxfmt",
  ts: "oxfmt",
  mts: "oxfmt",
  cts: "oxfmt",
  jsx: "oxfmt",
  tsx: "oxfmt",
  json: "oxfmt",
  jsonc: "oxfmt",
  css: "oxfmt",
  go: "gofmt",
  rs: "rustfmt",
  py: "black",
  sh: "shfmt",
};

export const RelayFormat: Plugin = async ({ $ }) => {
  async function formatFile(filePath: string): Promise<boolean> {
    const { extname } = await import("path");
    const ext = extname(filePath).slice(1).toLowerCase();
    const formatter = extMap[ext];
    if (!formatter) return false;
    try {
      await $`${formatter} ${filePath}`;
      return true;
    } catch {
      return false;
    }
  }

  return {
    event: async ({ event }) => {
      if (event.type === "tool.execute.after") {
        const input = event.input;
        const output = event.output;
        const writeTools = ["Write", "Edit", "edit", "write"];
        if (!writeTools.includes(input?.tool ?? "")) return;
        const filePath: string =
          output?.args?.filePath ??
          output?.args?.file_path ??
          output?.args?.path ??
          output?.args?.destination ??
          "";
        if (!filePath) return;
        const fs = await import("node:fs");
        if (!fs.existsSync(filePath as Parameters<typeof fs.existsSync>[0])) return;
        try {
          await formatFile(filePath);
        } catch {
          // ignore
        }
      }
    },
  };
};
