import Anthropic from "@anthropic-ai/sdk";
import { trace } from "./logger";

const TEST_MESSAGE = "Hi";
const TEST_MAX_TOKENS = 5;

export interface AnthropicConnectionConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Test connection using Anthropic SDK messages.create (real API call, not HEAD).
 * Returns true if the provider accepts the request and returns a message.
 */
export async function testAnthropicConnection(
  config: AnthropicConnectionConfig,
  providerName: string
): Promise<boolean> {
  if (!config.apiKey) {
    return false;
  }

  try {
    const client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: 15_000,
      maxRetries: 0,
    });

    trace(
      `${providerName}: messages.create model=${config.model} max_tokens=${TEST_MAX_TOKENS}`
    );
    const message = await client.messages.create({
      model: config.model,
      max_tokens: TEST_MAX_TOKENS,
      messages: [{ role: "user", content: TEST_MESSAGE }],
    });
    trace(
      `${providerName}: response id=${message.id} stop_reason=${message.stop_reason}`
    );
    return Boolean(message.id);
  } catch (e) {
    trace(
      `${providerName}: request failed ${e instanceof Error ? e.message : String(e)}`
    );
    return false;
  }
}
