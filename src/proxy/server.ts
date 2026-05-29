/**
 * Relay Proxy Server
 *
 * An HTTP proxy that intercepts Anthropic API requests and forwards them
 * to the configured provider (Z.AI, MiniMax, GitHub Copilot, etc.) with the real API key.
 *
 * For Z.AI and MiniMax: requests are forwarded as-is (Anthropic wire format).
 * For GitHub Copilot: requests are translated from Anthropic to OpenAI Chat Completions
 * format, and responses are translated back.
 *
 * Claude Code settings:
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:8787/api/anthropic
 *   ANTHROPIC_AUTH_TOKEN=<any non-empty string>
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getActiveAccount, listAccounts } from "../config/accounts-config.js";
import {
  getProviderProtocol,
  getProviderCustomHeaders,
  type WireProtocol,
} from "../config/provider-registry.js";
import {
  translateRequestToOpenAI,
  translateResponseToAnthropic,
  translateStreamToAnthropic,
} from "./translators/anthropic-openai.js";

const PORT = Number(process.env.RELAY_PROXY_PORT || "8787");

/**
 * Headers forwarded verbatim to Anthropic-compatible upstream providers (Z.AI, MiniMax).
 *
 * This allowlist exists to prevent client fingerprinting that can trigger ZAI's
 * "multiple users" detection. Different AI tools (Claude Code, ForgeCode, Codex CLI)
 * each send distinct identifying headers — User-Agent, x-stainless-*, anthropic-client-id,
 * anthropic-client-version — that make every tool look like a different "user" to ZAI
 * even though they all share the same API key through relay.
 *
 * By only forwarding API-relevant headers and letting relay present itself as a single
 * consistent client, all requests are indistinguishable to the upstream provider.
 */
const ANTHROPIC_HEADER_ALLOWLIST = new Set([
  "content-type",
  "anthropic-version",
  "anthropic-beta",
]);
const HOST = process.env["RELAY_HOST"] ?? "0.0.0.0";
const PROXY_BASE_PATH = "/api/anthropic";
const OPENAI_BASE_PATH = "/api/openai";

const CONFIG_DIR = join(homedir(), ".claude");
const LOG_FILE = join(CONFIG_DIR, "relay-proxy.log");
const PID_FILE = join(CONFIG_DIR, "relay-proxy.pid");

// Provider-specific headers are now loaded from the provider registry
// via getProviderCustomHeaders()

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

/**
 * Handle OpenAI-protocol requests: translate Anthropic → OpenAI, call API, translate back.
 * Used for providers that speak OpenAI Chat Completions format (copilot, openai, openrouter, etc.)
 */
async function handleOpenAIProtocolRequest(
  req: Request,
  bodyText: string,
  model: string,
  account: NonNullable<ReturnType<typeof getActiveAccount>>,
  url: URL,
  start: number,
): Promise<Response> {
  const parsed = JSON.parse(bodyText) as Record<string, unknown>;
  const isStream = parsed.stream === true;

  // Translate Anthropic request → OpenAI request
  const openaiBody = translateRequestToOpenAI(parsed as unknown as Parameters<typeof translateRequestToOpenAI>[0]);

  // Build target URL: /chat/completions
  const baseUrl = account.baseUrl.replace(/\/$/, "");
  const targetUrl = `${baseUrl}/chat/completions`;

  // Build headers with provider-specific additions from registry
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${account.apiKey}`);
  headers.set("Content-Type", "application/json");
  for (const [key, value] of Object.entries(getProviderCustomHeaders(account.provider))) {
    headers.set(key, value);
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(openaiBody),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ ts: new Date().toISOString(), error: "openai_fetch_failed", msg, targetUrl, model });
    return Response.json({ error: `Provider unreachable: ${msg}` }, { status: 502 });
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
    translated: true,
  });

  if (!upstreamRes.ok) {
    // Forward error as-is but wrap in Anthropic error format
    const errorBody = await upstreamRes.text();
    return Response.json(
      {
        type: "error",
        error: {
          type: "api_error",
          message: `${account.provider} API error (${upstreamRes.status}): ${errorBody}`,
        },
      },
      { status: upstreamRes.status },
    );
  }

  if (isStream) {
    // Streaming: translate SSE events from OpenAI → Anthropic format
    const anthropicStream = translateStreamToAnthropic(
      upstreamRes.body as ReadableStream<Uint8Array>,
      openaiBody.model,
    );

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of anthropicStream) {
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log({ ts: new Date().toISOString(), error: "openai_stream_error", msg });
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } else {
    // Non-streaming: translate response body
    const openaiResponse = (await upstreamRes.json()) as Record<string, unknown>;
    const anthropicResponse = translateResponseToAnthropic(
      openaiResponse as unknown as Parameters<typeof translateResponseToAnthropic>[0],
    );

    return Response.json(anthropicResponse, { status: 200 });
  }
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
    account =
      accounts.find((a) => a.provider === modelProvider && a.isActive) ??
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

  // ── OpenAI-format incoming requests (e.g. Codex CLI): simple passthrough ──
  // Requests arriving at /api/openai are already in OpenAI wire format.
  // Just replace auth and forward to the upstream provider — no translation.
  if (url.pathname.startsWith(OPENAI_BASE_PATH)) {
    const remaining = url.pathname.slice(OPENAI_BASE_PATH.length) || "/";
    const targetUrl = `${account.baseUrl.replace(/\/$/, "")}${remaining}${url.search}`;

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
      log({ ts: new Date().toISOString(), error: "openai_passthrough_failed", msg, targetUrl, model });
      return Response.json({ error: `Provider unreachable: ${msg}` }, { status: 502 });
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
      passthrough: "openai",
    });

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: upstreamRes.headers,
    });
  }

  // ── OpenAI-protocol providers: protocol translation required ───────────
  const protocol: WireProtocol = getProviderProtocol(account.provider);
  if (protocol === "openai" && bodyText) {
    return handleOpenAIProtocolRequest(req, bodyText, model, account, url, start);
  }

  // ── Anthropic-protocol providers: direct passthrough ────────────────────
  // This covers Z.AI, MiniMax, Anthropic, and any anthropic_compatible provider
  const remaining = url.pathname.startsWith(PROXY_BASE_PATH)
    ? url.pathname.slice(PROXY_BASE_PATH.length)
    : url.pathname;
  const targetUrl = `${account.baseUrl.replace(/\/$/, "")}${remaining}${url.search}`;

  // Build a clean, normalized header set — only forward what the Anthropic-compatible
  // API actually needs. Stripping client-identifying headers (User-Agent, x-stainless-*,
  // anthropic-client-id, anthropic-client-version, etc.) ensures relay presents itself
  // as a single consistent client to ZAI, preventing "multiple users" detection.
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${account.apiKey}`);
  for (const name of ANTHROPIC_HEADER_ALLOWLIST) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Guarantee Content-Type is always present
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

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

console.log(`relay proxy listening on http://${HOST === "0.0.0.0" ? "0.0.0.0 (all interfaces)" : HOST}:${PORT}`);
console.log(`  active account: ${getActiveAccount()?.name ?? "none"}`);
console.log(`  log: ${LOG_FILE}`);
console.log(`  pid: ${process.pid} → ${PID_FILE}`);

// Clean up PID file on exit
process.on("SIGTERM", () => {
  try {
    Bun.file(PID_FILE).delete();
  } catch {}
  process.exit(0);
});
process.on("SIGINT", () => {
  try {
    Bun.file(PID_FILE).delete();
  } catch {}
  process.exit(0);
});

export { server };
