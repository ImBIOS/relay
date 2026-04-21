/**
 * Relay Proxy Server
 *
 * An HTTP proxy that intercepts Anthropic API requests and forwards them
 * to the configured provider (Z.AI, MiniMax, etc.) with the real API key.
 *
 * Claude Code settings:
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:8787/api/anthropic
 *   ANTHROPIC_AUTH_TOKEN=<any non-empty string>
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getActiveAccount,
  listAccounts,
} from "../config/accounts-config.js";

const PORT = Number(process.env.RELAY_PROXY_PORT || "8787");
const HOST = "127.0.0.1";
const PROXY_BASE_PATH = "/api/anthropic";

const CONFIG_DIR = join(homedir(), ".claude");
const LOG_FILE = join(CONFIG_DIR, "relay-proxy.log");
const PID_FILE = join(CONFIG_DIR, "relay-proxy.pid");

// Write PID file so the stop command can kill us
try {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
} catch {}

function log(entry: Record<string, unknown>): void {
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {}
}

function getProviderForModel(model: string): string | null {
  const lower = model.toLowerCase();
  if (lower.startsWith("glm") || lower.startsWith("chatglm")) return "zai";
  if (lower.startsWith("minimax") || lower.startsWith("abab")) return "minimax";
  return null;
}

async function handleRequest(req: Request): Promise<Response> {
  const start = Date.now();
  const url = new URL(req.url);

  // Health check endpoint
  if (url.pathname === "/health") {
    const active = getActiveAccount();
    return Response.json({
      status: "ok",
      activeAccount: active?.name ?? null,
      activeProvider: active?.provider ?? null,
      port: PORT,
    });
  }

  // Buffer request body (always small — JSON prompts)
  let bodyText: string | undefined;
  let model = "unknown";
  if (req.method !== "GET" && req.method !== "HEAD") {
    bodyText = await req.text();
    try {
      const body = JSON.parse(bodyText) as { model?: string };
      if (body.model) model = body.model;
    } catch {}
  }

  // Determine target account: prefer model-based routing, fall back to active account
  let account = null;
  const modelProvider = model !== "unknown" ? getProviderForModel(model) : null;
  if (modelProvider) {
    const accounts = listAccounts();
    account = accounts.find((a) => a.provider === modelProvider && a.isActive) ??
      accounts.find((a) => a.provider === modelProvider) ??
      null;
  }
  if (!account) account = getActiveAccount();

  if (!account) {
    log({ ts: new Date().toISOString(), error: "no_active_account", model });
    return Response.json(
      { error: "No active account configured. Run 'relay account switch <id>'." },
      { status: 503 },
    );
  }

  // Build target URL: strip /api/anthropic prefix, forward remainder to provider base URL
  const remaining = url.pathname.startsWith(PROXY_BASE_PATH)
    ? url.pathname.slice(PROXY_BASE_PATH.length)
    : url.pathname;
  const targetUrl = `${account.baseUrl.replace(/\/$/, "")}${remaining}${url.search}`;

  // Forward headers, replace Authorization with real API key
  const headers = new Headers(req.headers);
  headers.set("Authorization", `Bearer ${account.apiKey}`);
  headers.delete("host");

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyText,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ ts: new Date().toISOString(), error: "upstream_fetch_failed", msg, targetUrl, model });
    return Response.json({ error: `Upstream unreachable: ${msg}` }, { status: 502 });
  }

  const latency = Date.now() - start;
  log({
    ts: new Date().toISOString(),
    method: req.method,
    path: url.pathname,
    model,
    provider: account.provider,
    account: account.name,
    status: upstreamRes.status,
    latency_ms: latency,
    target: targetUrl,
  });

  // Stream response back — preserves SSE streaming for Claude Code
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: upstreamRes.headers,
  });
}

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: handleRequest,
});

console.log(`relay proxy listening on http://${HOST}:${PORT}`);
console.log(`  active account: ${getActiveAccount()?.name ?? "none"}`);
console.log(`  log: ${LOG_FILE}`);
console.log(`  pid: ${process.pid} → ${PID_FILE}`);

// Clean up PID file on exit
process.on("SIGTERM", () => { try { Bun.file(PID_FILE).delete(); } catch {} process.exit(0); });
process.on("SIGINT", () => { try { Bun.file(PID_FILE).delete(); } catch {} process.exit(0); });

export { server };
