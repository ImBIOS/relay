import { createOpencode } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import Bun from "bun";

interface VersionedModel {
  id: string;
  major: number;
  minor: number;
  patch: number;
}

function parseMiniMaxVersion(id: string): VersionedModel | null {
  const match = id.match(/MiniMax-M(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;
  return {
    id,
    major: parseInt(match[1]!),
    minor: parseInt(match[2] ?? "0"),
    patch: parseInt(match[3] ?? "0"),
  };
}

async function getBestMiniMaxModel(): Promise<string> {
  const proc = Bun.spawn(["opencode", "models"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, output, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`[relay] Failed to list models: ${stderr.trim()}`);
  }

  const available = output
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates = available
    .filter((id) => id.startsWith("minimax-coding-plan/") && !id.endsWith("-highspeed"))
    .map(parseMiniMaxVersion)
    .filter((v): v is VersionedModel => v !== null)
    .sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch);

  if (candidates.length === 0) {
    throw new Error(
      `[relay] No suitable MiniMax model found. Available models:\n${available.join("\n")}`,
    );
  }

  return candidates[0]!.id;
}

let cachedModel: string | null = null;

export async function getModel(): Promise<string> {
  if (!cachedModel) {
    cachedModel = await getBestMiniMaxModel();
  }
  return cachedModel;
}

export async function withOpencode<T>(fn: (client: OpencodeClient) => Promise<T>): Promise<T> {
  const model = await getModel();
  const { client, server } = await createOpencode({
    config: { model },
  });
  try {
    return await fn(client);
  } finally {
    server.close();
  }
}
