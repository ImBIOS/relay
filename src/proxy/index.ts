/**
 * Proxy lifecycle management.
 * The actual proxy server is in ../proxy/server.ts (Bun-native).
 * This module wraps it as a background subprocess so it can be
 * started/stopped via CLI commands.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".claude");
const PID_FILE = join(CONFIG_DIR, "relay-proxy.pid");

export interface StartOptions {
  port?: number;
}

export async function startProxy(opts: StartOptions = {}): Promise<{ address(): string | { address: string; port: number } }> {
  const port = opts.port ?? 8787;

  if (isProxyRunning()) {
    throw Object.assign(new Error("Proxy already running"), { code: "EADDRINUSE" });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(
      "bun",
      ["run", join(__dirname, "..", "proxy", "server.ts")],
      { detached: true, stdio: "ignore", env: { ...process.env, RELAY_PROXY_PORT: String(port) } },
    );

    child.on("error", reject);

    setTimeout(() => {
      if (child.pid && isProxyRunning()) {
        resolve({
          address() {
            return { address: "127.0.0.1", port };
          },
        });
      } else {
        reject(new Error("Proxy failed to start"));
      }
    }, 1000);
  });
}

export async function stopProxy(): Promise<boolean> {
  if (!isProxyRunning()) return false;
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    process.kill(pid, "SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    return true;
  } catch {
    return false;
  }
}

export function getProxyStatus(): { running: boolean; port: number | null } {
  if (!isProxyRunning()) return { running: false, port: null };
  try {
    return { running: true, port: parseInt(process.env.RELAY_PROXY_PORT ?? "8787", 10) };
  } catch {
    return { running: true, port: null };
  }
}

export async function ensureRelayProxyRunning(): Promise<void> {
  if (isProxyRunning()) return;
  await startProxy({ port: 8787 });
}

function isProxyRunning(): boolean {
  try {
    if (!existsSync(PID_FILE)) return false;
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
