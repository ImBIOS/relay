import { describe, expect, it } from "bun:test";
import {
  translateRequestToOpenAI,
  translateResponseToAnthropic,
  type OpenAIResponse,
} from "./anthropic-openai";

describe("translateRequestToOpenAI", () => {
  it("should translate a simple text message", () => {
    const anthropic = {
      model: "gpt-4o",
      messages: [
        { role: "user" as const, content: "Hello" },
      ],
      max_tokens: 1024,
    };

    const openai = translateRequestToOpenAI(anthropic);

    expect(openai.model).toBe("gpt-4o");
    expect(openai.max_tokens).toBe(1024);
    expect(openai.messages).toHaveLength(1);
    expect(openai.messages[0]).toEqual({ role: "user", content: "Hello" });
  });

  it("should translate system prompt from top-level to message", () => {
    const anthropic = {
      model: "gpt-4o",
      messages: [
        { role: "user" as const, content: "Hello" },
      ],
      max_tokens: 1024,
      system: "You are a helpful assistant.",
    };

    const openai = translateRequestToOpenAI(anthropic);

    expect(openai.messages[0]).toEqual({ role: "system", content: "You are a helpful assistant." });
    expect(openai.messages[1]).toEqual({ role: "user", content: "Hello" });
  });

  it("should translate system prompt array format", () => {
    const anthropic = {
      model: "gpt-4o",
      messages: [
        { role: "user" as const, content: "Hello" },
      ],
      max_tokens: 1024,
      system: [
        { type: "text" as const, text: "Part 1" },
        { type: "text" as const, text: "Part 2" },
      ],
    };

    const openai = translateRequestToOpenAI(anthropic);

    expect(openai.messages[0]).toEqual({ role: "system", content: "Part 1\nPart 2" });
  });

  it("should translate tool definitions", () => {
    const anthropic = {
      model: "gpt-4o",
      messages: [
        { role: "user" as const, content: "Use a tool" },
      ],
      max_tokens: 1024,
      tools: [
        {
          name: "get_weather",
          description: "Get the weather",
          input_schema: { type: "object", properties: { city: { type: "string" } } },
        },
      ],
    };

    const openai = translateRequestToOpenAI(anthropic);

    expect(openai.tools).toHaveLength(1);
    expect(openai.tools![0]).toEqual({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get the weather",
        parameters: { type: "object", properties: { city: { type: "string" } } },
      },
    });
  });

  it("should translate tool_use (assistant) to tool_calls", () => {
    const anthropic = {
      model: "gpt-4o",
      messages: [
        { role: "user" as const, content: "Check weather" },
        {
          role: "assistant" as const,
          content: [
            { type: "text" as const, text: "Let me check." },
            { type: "tool_use" as const, id: "toolu_123", name: "get_weather", input: { city: "SF" } },
          ],
        },
      ],
      max_tokens: 1024,
    };

    const openai = translateRequestToOpenAI(anthropic);

    // user, assistant
    expect(openai.messages).toHaveLength(2);
    const assistantMsg = openai.messages[1]!;
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toBe("Let me check.");
    expect(assistantMsg.tool_calls).toHaveLength(1);
    expect(assistantMsg.tool_calls![0]).toEqual({
      id: "toolu_123",
      type: "function",
      function: { name: "get_weather", arguments: '{"city":"SF"}' },
    });
  });

  it("should translate tool_result (user) to tool role message", () => {
    const anthropic = {
      model: "gpt-4o",
      messages: [
        { role: "user" as const, content: "Check weather" },
        {
          role: "assistant" as const,
          content: [
            { type: "tool_use" as const, id: "toolu_123", name: "get_weather", input: { city: "SF" } },
          ],
        },
        {
          role: "user" as const,
          content: [
            { type: "tool_result" as const, tool_use_id: "toolu_123", content: "Sunny, 72F" },
          ],
        },
      ],
      max_tokens: 1024,
    };

    const openai = translateRequestToOpenAI(anthropic);

    // user, assistant, tool
    expect(openai.messages).toHaveLength(3);
    const toolMsg = openai.messages[2]!;
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("toolu_123");
    expect(toolMsg.content).toBe("Sunny, 72F");
  });

  it("should translate optional parameters", () => {
    const anthropic = {
      model: "gpt-4o",
      messages: [{ role: "user" as const, content: "Hi" }],
      max_tokens: 512,
      temperature: 0.7,
      top_p: 0.9,
      stop_sequences: ["END"],
      stream: true,
    };

    const openai = translateRequestToOpenAI(anthropic);

    expect(openai.temperature).toBe(0.7);
    expect(openai.top_p).toBe(0.9);
    expect(openai.stop).toEqual(["END"]);
    expect(openai.stream).toBe(true);
  });
});

describe("translateResponseToAnthropic", () => {
  it("should translate a simple text response", () => {
    const openai = {
      id: "chatcmpl-123",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello!" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const anthropic = translateResponseToAnthropic(openai);

    expect(anthropic.id).toBe("chatcmpl-123");
    expect(anthropic.type).toBe("message");
    expect(anthropic.role).toBe("assistant");
    expect(anthropic.model).toBe("gpt-4o");
    expect(anthropic.stop_reason).toBe("end_turn");
    expect(anthropic.content).toEqual([{ type: "text", text: "Hello!" }]);
    expect(anthropic.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it("should translate tool_calls response", () => {
    const openai = {
      id: "chatcmpl-456",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_abc",
                type: "function" as const,
                function: { name: "get_weather", arguments: '{"city":"SF"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    };

    const anthropic = translateResponseToAnthropic(openai as unknown as OpenAIResponse);
    expect(anthropic.content).toEqual([
      {
        type: "tool_use",
        id: "call_abc",
        name: "get_weather",
        input: { city: "SF" },
      },
    ]);
  });

  it("should translate finish_reason 'length' to 'max_tokens'", () => {
    const openai = {
      id: "chatcmpl-789",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Truncated..." },
          finish_reason: "length",
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    };

    const anthropic = translateResponseToAnthropic(openai);

    expect(anthropic.stop_reason).toBe("max_tokens");
  });

  it("should handle response with both text and tool_calls", () => {
    const openai = {
      id: "chatcmpl-mix",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Let me check that.",
            tool_calls: [
              {
                id: "call_mix",
                type: "function" as const,
                function: { name: "search", arguments: '{"q":"test"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
    };

    const anthropic = translateResponseToAnthropic(openai as unknown as OpenAIResponse);
    expect(anthropic.content[0]).toEqual({ type: "text", text: "Let me check that." });
    expect(anthropic.content[1]).toEqual({
      type: "tool_use",
      id: "call_mix",
      name: "search",
      input: { q: "test" },
    });
  });

  it("should handle empty response gracefully", () => {
    const openai = {
      id: "chatcmpl-empty",
      object: "chat.completion",
      model: "gpt-4o",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: null },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };

    const anthropic = translateResponseToAnthropic(openai);

    expect(anthropic.content).toEqual([{ type: "text", text: "" }]);
  });
});
