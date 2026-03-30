/**
 * Experiment: Test Claude Agent SDK with custom providers (MiniMax and Z.AI)
 *
 * This script demonstrates how to switch between providers by setting
 * the appropriate environment variables before invoking the Agent SDK.
 */

import { type ClaudeAgentOptions, query } from "@anthropic-ai/claude-agent-sdk";
import type { Provider } from "./providers/base";
import { minimaxProvider } from "./providers/minimax";
import { zaiProvider } from "./providers/zai";

type ProviderName = "minimax" | "zai";

interface ProviderInfo {
  name: ProviderName;
  provider: Provider;
}

const providers: ProviderInfo[] = [
  { name: "minimax", provider: minimaxProvider },
  { name: "zai", provider: zaiProvider },
];

function setProviderEnv(provider: Provider): void {
  const config = provider.getConfig();
  process.env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
  process.env.ANTHROPIC_BASE_URL = config.baseUrl;
  process.env.ANTHROPIC_MODEL = config.defaultModel;
  process.env.API_TIMEOUT_MS = "3000000";
}

async function runAgentWithProvider(
  providerInfo: ProviderInfo,
  prompt: string
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Provider: ${providerInfo.provider.displayName}`);
  console.log(`${"=".repeat(60)}`);

  // Set environment variables for the provider
  setProviderEnv(providerInfo.provider);

  // Get model info
  const config = providerInfo.provider.getConfig();
  console.log(`Model: ${config.defaultModel}`);
  console.log(`Base URL: ${config.baseUrl}`);

  const options: ClaudeAgentOptions = {
    allowedTools: ["Read", "Bash"],
  };

  try {
    console.log("\nRunning agent...\n");

    for await (const message of query({ prompt, options })) {
      if ("result" in message) {
        console.log(message.result);
      }
    }

    console.log("\nAgent completed successfully!");
  } catch (error) {
    console.error(`Error with ${providerInfo.provider.displayName}:`, error);
  }
}

async function main(): Promise<void> {
  console.log("Claude Agent SDK - Provider Switching Experiment");
  console.log("This script tests switching between MiniMax and Z.AI providers");

  const testPrompt =
    "What files are in this directory? List them with brief descriptions.";

  // Test each provider
  for (const providerInfo of providers) {
    await runAgentWithProvider(providerInfo, testPrompt);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Experiment complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
