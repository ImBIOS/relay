/**
 * Integration test: Relay Proxy as ForgeCode provider with "Relay" model.
 *
 * Tests the full pipeline:
 *   ForgeCode → ANTHROPIC_BASE_URL → Relay Proxy → MiniMax API
 *
 * Verifies:
 *   1. Relay proxy is healthy and has MiniMax accounts configured
 *   2. .forge.toml contains the "relay" custom provider
 *   3. "Relay" is a valid provider string in the ForgeCode model config
 *   4. A real Anthropic-format messages request through the proxy returns a valid response
 *
 * Must run inside the Docker test container (Dockerfile.forgecode) with MiniMax credentials.
 * NOT safe to run on host — makes real API calls that consume quota.
 *
 * Run:
 *   docker build -f Dockerfile.forgecode -t relay-proxy-forgecode ..  (from monorepo root)
 *   docker run --rm \
 *     -v ./test-configs/relay-settings.json:/root/.config/relay/settings.json:ro \
 *     -v ./test-configs/forge-credentials.json:/root/forge/.credentials.json:ro \
 *     -v ./test-configs/forge-mcp.json:/root/forge/.mcp.json:ro \
 *     -v ./test-configs/forge.toml:/root/forge/.forge.toml:ro \
 *     -e ANTHROPIC_BASE_URL=http://127.0.0.1:8787/api/anthropic \
 *     -e ANTHROPIC_AUTH_TOKEN=placeholder \
 *     -e RELAY_PROXY_PORT=8787 \
 *     -e HOME=/root \
 *     relay-proxy-forgecode \
 *     bun test src/tests/integration/relay-forgecode-provider.integration.test.ts
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RELAY_PORT = process.env.RELAY_PROXY_PORT || "8787";
const RELAY_BASE = `http://127.0.0.1:${RELAY_PORT}`;
const FORGE_CONFIG_PATH = join(process.env.HOME || "/root", "forge", ".forge.toml");
const RELAY_SETTINGS_PATH = join(process.env.HOME || "/root", ".config", "relay", "settings.json");

// Timeout for real API calls (MiniMax can be slow)
const API_TIMEOUT_MS = 30_000;

describe("Relay Proxy as ForgeCode provider", () => {
  // ── 1. Proxy health ────────────────────────────────────────────────────────
  test("relay proxy is healthy", async () => {
    const res = await fetch(`${RELAY_BASE}/health`);
    expect(res.ok).toBe(true);

    const health = (await res.json()) as {
      status: string;
      activeAccount: string | null;
      activeProvider: string | null;
      port: number;
    };

    expect(health.status).toBe("ok");
    expect(health.activeProvider).toBe("minimax");
    expect(health.activeAccount).toBeTruthy();
  });

  // ── 2. Relay settings contain MiniMax accounts ─────────────────────────────
  test("relay settings have MiniMax accounts, zero ZAI", () => {
    expect(existsSync(RELAY_SETTINGS_PATH)).toBe(true);
    const settings = JSON.parse(readFileSync(RELAY_SETTINGS_PATH, "utf-8")) as {
      accounts?: Record<string, { provider: string }>;
    };

    const accounts = Object.values(settings.accounts ?? {});
    const minimaxCount = accounts.filter((a) => a.provider === "minimax").length;
    const zaiCount = accounts.filter((a) => a.provider === "zai").length;

    expect(minimaxCount).toBeGreaterThan(0);
    expect(zaiCount).toBe(0);
  });

  // ── 3. .forge.toml contains "relay" provider ──────────────────────
  test(".forge.toml contains relay custom provider", () => {
    expect(existsSync(FORGE_CONFIG_PATH)).toBe(true);
    const toml = readFileSync(FORGE_CONFIG_PATH, "utf-8");

    // Verify the provider ID exists
    expect(toml).toContain('id = "relay"');

    // Verify it uses Anthropic response type
    expect(toml).toContain('response_type = "Anthropic"');

    // Verify it points to the relay proxy
    expect(toml).toContain("http://127.0.0.1:8787/api/anthropic");

    // Verify session uses relay provider
    expect(toml).toContain('provider_id = "relay"');
  });

  // ── 4. "Relay" is a valid model string in .forge.toml ─────────────
  test("Relay model is defined with correct ID", () => {
    const toml = readFileSync(FORGE_CONFIG_PATH, "utf-8");

    // Check that the model name is "Relay"
    expect(toml).toContain('name = "Relay"');

    // Check model ID matches the session model_id
    expect(toml).toContain('id = "Relay"');
  });

  // ── 5. End-to-end: real API call through relay proxy ──────────────────────
  test("sends Anthropic messages request through relay proxy to MiniMax", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const res = await fetch(`${RELAY_BASE}/api/anthropic/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "placeholder",
          anthropic_version: "2023-06-01",
        },
        body: JSON.stringify({
          model: "Relay",
          max_tokens: 64,
          messages: [
            {
              role: "user",
              content: "Say exactly: Relay test OK",
            },
          ],
        }),
        signal: controller.signal,
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        id?: string;
        type?: string;
        role?: string;
        content?: Array<{ type: string; text: string }>;
        model?: string;
        stop_reason?: string;
        usage?: { input_tokens: number; output_tokens: number };
      };

      // Verify Anthropic response shape
      expect(body.type).toBe("message");
      expect(body.role).toBe("assistant");
      expect(body.content).toBeDefined();
      expect(body.content!.length).toBeGreaterThan(0);
      expect(body.content![0].type).toBe("text");
      expect(body.content![0].text.length).toBeGreaterThan(0);

      // Verify model echo
      expect(body.model).toContain("MiniMax");

      console.log(`   Model: ${body.model}`);
      console.log(`   Response: ${body.content![0].text.slice(0, 100)}`);
      console.log(`   Tokens: ${body.usage?.input_tokens} in / ${body.usage?.output_tokens} out`);
    } finally {
      clearTimeout(timeoutId);
    }
  });

  // ── 6. Streaming request through relay proxy ──────────────────────────────
  test("sends streaming Anthropic messages request through relay proxy", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const res = await fetch(`${RELAY_BASE}/api/anthropic/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "placeholder",
          anthropic_version: "2023-06-01",
        },
        body: JSON.stringify({
          model: "Relay",
          max_tokens: 32,
          stream: true,
          messages: [
            {
              role: "user",
              content: "Say: hi",
            },
          ],
        }),
        signal: controller.signal,
      });

      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      // Read the stream and collect events
      const reader = res.body?.getReader();
      expect(reader).toBeTruthy();

      const decoder = new TextDecoder();
      let eventCount = 0;
      let hasContentDelta = false;
      let hasMessageStop = false;

      if (reader) {
        // Read with timeout protection
        const streamTimeout = setTimeout(() => {
          reader.cancel();
        }, API_TIMEOUT_MS);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventCount++;
                const eventType = line.slice(7).trim();
                if (eventType === "content_block_delta") hasContentDelta = true;
                if (eventType === "message_stop") hasMessageStop = true;
              }
            }
          }
        } finally {
          clearTimeout(streamTimeout);
        }
      }

      // Verify we got streaming events
      expect(eventCount).toBeGreaterThan(0);
      expect(hasContentDelta).toBe(true);
      expect(hasMessageStop).toBe(true);

      console.log(`   Stream events received: ${eventCount}`);
    } finally {
      clearTimeout(timeoutId);
    }
  });
});
