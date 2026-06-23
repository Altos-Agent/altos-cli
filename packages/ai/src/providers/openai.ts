// @altos/ai - OpenAI-compatible provider adapter

import { BaseProvider } from "./base.js";
import {
  ChatOptions,
  ChatResponse,
  Message,
  ModelInfo,
  StreamChunk,
  ToolCall,
  ToolDefinition,
  Usage,
} from "../index.js";
import { ProviderError } from "./error.js";

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    providerId: "openai",
    contextWindow: 128000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    providerId: "openai",
    contextWindow: 128000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    providerId: "openai",
    contextWindow: 128000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 10,
    outputCostPer1M: 30,
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    providerId: "openai",
    contextWindow: 16385,
    supportsToolCalling: true,
    supportsVision: false,
    supportsReasoningEffort: false,
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
  },
];

interface OpenAIMessage {
  role: string;
  content: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAIStreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string; tool_calls?: unknown[] };
    finish_reason?: string;
  }>;
}

export class OpenAIProvider extends BaseProvider {
  readonly id = "openai";
  readonly name = "OpenAI";
  readonly supportsToolCalling = true;
  readonly supportsVision = true;
  readonly supportsReasoningEffort = false;
  readonly contextWindow = 128000;

  private baseUrl = "https://api.openai.com/v1";

  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey);
    if (baseUrl) {
      (this as unknown as { baseUrl: string }).baseUrl = baseUrl;
    }
  }

  listModels(): ModelInfo[] {
    return DEFAULT_MODELS;
  }

  async completeChat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? "gpt-4o";
    const apiKey = this.getApiKey();

    const openAIMessages = this.transformMessages(messages);
    const body: Record<string, unknown> = {
      model,
      messages: openAIMessages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
    };

    if (options?.tools?.length) {
      body.tools = this.transformTools(options.tools);
      body.tool_choice = "auto";
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error");
        throw this.createProviderError(
          `API request failed: ${error}`,
          response.status,
          response.status >= 500 || response.status === 429,
        );
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: { role: string; content: string; tool_calls?: ToolCall[] };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const choice = data.choices[0];
      const usage: Usage = {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        estimatedCost: this.estimateCost(data.usage.prompt_tokens, data.usage.completion_tokens),
      };

      return {
        content: choice.message.content ?? "",
        model,
        finishReason: this.mapFinishReason(choice.finish_reason),
        usage,
        toolCalls: choice.message.tool_calls,
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      return this.createErrorResponse(err, model);
    }
  }

  async *streamChat(
    messages: Message[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const model = options?.model ?? "gpt-4o";
    const apiKey = this.getApiKey();

    const openAIMessages = this.transformMessages(messages);
    const body: Record<string, unknown> = {
      model,
      messages: openAIMessages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };

    if (options?.tools?.length) {
      body.tools = this.transformTools(options.tools);
      body.tool_choice = "auto";
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => "Unknown error");
        throw this.createProviderError(
          `API request failed: ${error}`,
          response.status,
          response.status >= 500 || response.status === 429,
        );
      }

      if (!response.body) {
        throw this.createProviderError("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;

            if (trimmed.startsWith("data: ")) {
              const jsonStr = trimmed.slice(6);
              try {
                const chunk = JSON.parse(jsonStr) as OpenAIStreamChunk;
                const delta = chunk.choices[0]?.delta;

                if (delta?.content) {
                  yield { type: "content", content: delta.content };
                }

                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls as Array<{
                    id: string;
                    function: { name: string; arguments: string };
                  }>) {
                    yield {
                      type: "toolCall",
                      toolCall: {
                        id: tc.id,
                        type: "function",
                        function: { name: tc.function.name, arguments: tc.function.arguments },
                      },
                    };
                  }
                }

                if (chunk.choices[0]?.finish_reason) {
                  yield {
                    type: "done",
                    finishReason: chunk.choices[0].finish_reason,
                  };
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      yield { type: "content", content: "" };
      yield { type: "done", finishReason: "error" };
    }
  }

  private transformMessages(messages: Message[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const result: OpenAIMessage = { role: msg.role, content: msg.content };
      if (msg.name) result.name = msg.name;
      if (msg.role === "tool") result.tool_call_id = msg.toolCallId;
      return result;
    });
  }

  private transformTools(tools: ToolDefinition[]): unknown {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private mapFinishReason(reason: string): ChatResponse["finishReason"] {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "content_filter":
        return "content_filter";
      case "tool_calls":
        return "tool_use";
      default:
        return "stop";
    }
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * 2.5;
    const outputCost = (outputTokens / 1_000_000) * 10;
    return inputCost + outputCost;
  }
}
