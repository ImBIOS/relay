/**
 * Protocol translation between Anthropic Messages API and OpenAI Chat Completions API.
 *
 * Claude Code sends requests in Anthropic format. GitHub Copilot only speaks
 * OpenAI Chat Completions format. These translators bridge the gap.
 *
 * Anthropic → OpenAI: request body translation
 * OpenAI → Anthropic: response body translation
 * SSE streaming: event-by-event translation
 */

// ── Type definitions ──────────────────────────────────────────────────────

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  thinking?: string;
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string | Array<{ type: "text"; text: string }>;
  tools?: AnthropicTool[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  metadata?: Record<string, unknown>;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  tools?: OpenAITool[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop?: string[];
}

// ── Anthropic → OpenAI request translation ────────────────────────────────

/**
 * Translate an Anthropic Messages API request body to OpenAI Chat Completions format.
 */
export function translateRequestToOpenAI(anthropic: AnthropicRequest): OpenAIRequest {
  const messages: OpenAIMessage[] = [];

  // System prompt: Anthropic uses top-level `system` field
  if (anthropic.system) {
    const systemText =
      typeof anthropic.system === "string"
        ? anthropic.system
        : anthropic.system.map((s) => s.text).join("\n");
    messages.push({ role: "system", content: systemText });
  }

  // Messages
  for (const msg of anthropic.messages) {
    if (msg.role === "user") {
      const text = extractTextFromContent(msg.content);
      // Check if this is a tool_result message
      const toolResults = extractToolResults(msg.content);
      if (toolResults.length > 0) {
        for (const result of toolResults) {
          messages.push({
            role: "tool",
            tool_call_id: result.tool_use_id,
            content: result.content,
          });
        }
      } else {
        messages.push({ role: "user", content: text });
      }
    } else if (msg.role === "assistant") {
      const text = extractTextFromContent(msg.content);
      const toolUses = extractToolUses(msg.content);

      const openaiMsg: OpenAIMessage = { role: "assistant" };

      if (toolUses.length > 0) {
        openaiMsg.tool_calls = toolUses.map((tu) => ({
          id: tu.id,
          type: "function" as const,
          function: {
            name: tu.name,
            arguments: typeof tu.input === "string" ? tu.input : JSON.stringify(tu.input),
          },
        }));
        // Also include any text content
        if (text) {
          openaiMsg.content = text;
        }
      } else {
        openaiMsg.content = text;
      }

      messages.push(openaiMsg);
    }
  }

  const openai: OpenAIRequest = {
    model: anthropic.model,
    messages,
    max_tokens: anthropic.max_tokens,
    stream: anthropic.stream,
  };

  // Tools
  if (anthropic.tools && anthropic.tools.length > 0) {
    openai.tools = anthropic.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  // Optional params
  if (anthropic.temperature !== undefined) openai.temperature = anthropic.temperature;
  if (anthropic.top_p !== undefined) openai.top_p = anthropic.top_p;
  if (anthropic.stop_sequences) openai.stop = anthropic.stop_sequences;

  return openai;
}

// ── OpenAI → Anthropic response translation ───────────────────────────────

interface OpenAIResponseChoice {
  index: number;
  message?: {
    role: string;
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason?: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  model: string;
  choices: OpenAIResponseChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<Record<string, unknown>>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

const FINISH_REASON_MAP: Record<string, string> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  length: "max_tokens",
};

/**
 * Translate an OpenAI Chat Completions response to Anthropic Messages format.
 */
export function translateResponseToAnthropic(openai: OpenAIResponse): AnthropicResponse {
  const choice = openai.choices[0];
  const content: Array<Record<string, unknown>> = [];

  if (choice?.message?.content) {
    content.push({ type: "text", text: choice.message.content });
  }

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.function.name,
        input: safeParseJSON(tc.function.arguments),
      });
    }
  }

  return {
    id: openai.id || `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    model: openai.model,
    stop_reason: choice?.finish_reason
      ? FINISH_REASON_MAP[choice.finish_reason] ?? choice.finish_reason
      : null,
    stop_sequence: null,
    usage: {
      input_tokens: openai.usage?.prompt_tokens ?? 0,
      output_tokens: openai.usage?.completion_tokens ?? 0,
    },
  };
}

// ── SSE Streaming translation ─────────────────────────────────────────────

/**
 * Translate an OpenAI SSE stream into an Anthropic SSE stream.
 *
 * OpenAI sends events like:
 *   data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hi"}}]}
 *   data: [DONE]
 *
 * Anthropic expects events like:
 *   event: message_start
 *   data: {"type":"message_start","message":{...}}
 *
 *   event: content_block_start
 *   data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
 *
 *   event: content_block_delta
 *   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}
 *
 *   event: content_block_stop
 *   data: {"type":"content_block_stop","index":0}
 *
 *   event: message_delta
 *   data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}
 *
 *   event: message_stop
 *   data: {"type":"message_stop"}
 */
export async function* translateStreamToAnthropic(
  openaiStream: ReadableStream<Uint8Array>,
  model: string,
): AsyncGenerator<string> {
  const reader = openaiStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let msgId = `msg_${Date.now()}`;
  let contentBlockIndex = 0;
  let hasStarted = false;
  let totalOutputTokens = 0;
  let currentToolCallId = "";
  let currentToolCallName = "";
  let currentToolCallArgs = "";

  try {
    // Emit message_start
    yield* emitSSE("message_start", {
      type: "message_start",
      message: {
        id: msgId,
        type: "message",
        role: "assistant",
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed === "data: [DONE]") {
          // Close any open content blocks
          if (hasStarted) {
            // Close tool call content block if open
            if (currentToolCallId) {
              yield* emitSSE("content_block_stop", {
                type: "content_block_stop",
                index: contentBlockIndex,
              });
              contentBlockIndex++;
              currentToolCallId = "";
            }
            yield* emitSSE("content_block_stop", {
              type: "content_block_stop",
              index: contentBlockIndex,
            });
          }

          // Emit message_delta with stop reason
          yield* emitSSE("message_delta", {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: totalOutputTokens },
          });

          yield* emitSSE("message_stop", {
            type: "message_stop",
          });
          continue;
        }

        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6);
        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          continue;
        }

        const id = chunk.id as string | undefined;
        if (id) msgId = id;

        const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
        if (!choices || choices.length === 0) continue;

        const choice = choices[0]!;
        const delta = choice.delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        // Handle content text delta
        const content = delta.content as string | undefined;
        if (content !== undefined && content !== null) {
          if (!hasStarted) {
            // Start text content block
            yield* emitSSE("content_block_start", {
              type: "content_block_start",
              index: contentBlockIndex,
              content_block: { type: "text", text: "" },
            });
            hasStarted = true;
          }

          yield* emitSSE("content_block_delta", {
            type: "content_block_delta",
            index: contentBlockIndex,
            delta: { type: "text_delta", text: content },
          });
          totalOutputTokens++;
        }

        // Handle tool call start
        const toolCalls = delta.tool_calls as Array<Record<string, unknown>> | undefined;
        if (toolCalls) {
          for (const tc of toolCalls) {
            const tcId = tc.id as string | undefined;
            const tcFunction = tc.function as Record<string, unknown> | undefined;

            // New tool call (has id)
            if (tcId) {
              // Close previous content block if open
              if (hasStarted) {
                yield* emitSSE("content_block_stop", {
                  type: "content_block_stop",
                  index: contentBlockIndex,
                });
                contentBlockIndex++;
              }

              currentToolCallId = tcId;
              currentToolCallName = (tcFunction?.name as string) ?? "";
              currentToolCallArgs = "";

              yield* emitSSE("content_block_start", {
                type: "content_block_start",
                index: contentBlockIndex,
                content_block: {
                  type: "tool_use",
                  id: currentToolCallId,
                  name: currentToolCallName,
                  input: {},
                },
              });
              hasStarted = true;
            }

            // Tool call arguments delta
            const args = tcFunction?.arguments as string | undefined;
            if (args) {
              currentToolCallArgs += args;
              yield* emitSSE("content_block_delta", {
                type: "content_block_delta",
                index: contentBlockIndex,
                delta: {
                  type: "input_json_delta",
                  partial_json: args,
                },
              });
            }
          }
        }

        // Handle finish_reason
        const finishReason = choice.finish_reason as string | undefined;
        if (finishReason) {
          // Close any open content blocks
          if (currentToolCallId) {
            yield* emitSSE("content_block_stop", {
              type: "content_block_stop",
              index: contentBlockIndex,
            });
            contentBlockIndex++;
            currentToolCallId = "";
          }
          if (hasStarted) {
            yield* emitSSE("content_block_stop", {
              type: "content_block_stop",
              index: contentBlockIndex,
            });
          }

          const stopReason = FINISH_REASON_MAP[finishReason] ?? finishReason;
          yield* emitSSE("message_delta", {
            type: "message_delta",
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: totalOutputTokens },
          });

          yield* emitSSE("message_stop", {
            type: "message_stop",
          });

          // Reset state for potential future chunks
          hasStarted = false;
          contentBlockIndex = 0;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function* emitSSE(event: string, data: unknown): Generator<string> {
  yield `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function extractTextFromContent(
  content: string | AnthropicContentBlock[],
): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

function extractToolUses(
  content: string | AnthropicContentBlock[],
): Array<{ id: string; name: string; input: unknown }> {
  if (typeof content === "string") return [];
  return content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input }));
}

function extractToolResults(
  content: string | AnthropicContentBlock[],
): Array<{ tool_use_id: string; content: string }> {
  if (typeof content === "string") return [];
  return content
    .filter((b) => b.type === "tool_result")
    .map((b) => ({
      tool_use_id: b.tool_use_id ?? "",
      content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
    }));
}

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
