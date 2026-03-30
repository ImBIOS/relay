/**
 * Test API keys from .env (Bun loads .env from cwd when you run this).
 * Run from project root: bun run src/test-env-keys.ts
 * Logging: set LOG_LEVEL=trace (or debug|info|warning|error); default for this script is trace.
 */
import { minimaxProvider } from "./providers/minimax";
import { zaiProvider } from "./providers/zai";
import { debug, info, error as logError, success, trace } from "./utils/logger";

if (process.env.LOG_LEVEL === undefined) {
  process.env.LOG_LEVEL = "trace";
}

async function main(): Promise<void> {
  const results: { provider: string; ok: boolean; error?: string }[] = [];

  trace("Loading provider configs from process.env");
  const zaiConfig = zaiProvider.getConfig();
  debug(
    `ZAI baseUrl=${zaiConfig.baseUrl}, apiKey set=${Boolean(zaiConfig.apiKey)}`
  );

  if (zaiConfig.apiKey) {
    try {
      trace("ZAI: testing connection via Anthropic SDK");
      const ok = await zaiProvider.testConnection();
      results.push({ provider: "ZAI", ok });
    } catch (err) {
      results.push({
        provider: "ZAI",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    results.push({ provider: "ZAI", ok: false, error: "ZAI_API_KEY not set" });
  }

  const minimaxConfig = minimaxProvider.getConfig();
  debug(
    `MiniMax baseUrl=${minimaxConfig.baseUrl}, apiKey set=${Boolean(minimaxConfig.apiKey)}`
  );

  if (minimaxConfig.apiKey) {
    try {
      trace("MiniMax: testing connection via Anthropic SDK");
      const ok = await minimaxProvider.testConnection();
      results.push({ provider: "MiniMax", ok });
    } catch (err) {
      results.push({
        provider: "MiniMax",
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    results.push({
      provider: "MiniMax",
      ok: false,
      error: "MINIMAX_API_KEY not set",
    });
  }

  info("Results:");
  for (const r of results) {
    if (r.ok) {
      success(`${r.provider}: OK`);
    } else {
      logError(`${r.provider}: FAIL${r.error ? ` (${r.error})` : ""}`);
    }
  }

  const failed = results.some((r) => !r.ok);
  process.exit(failed ? 1 : 0);
}

main();
