// @altos/ai - OpenRouter provider adapter

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
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet (via OpenRouter)",
    providerId: "openrouter",
    contextWindow: 200000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o (via OpenRouter)",
    providerId: "openrouter",
    contextWindow: 128000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10,
  },
  {
    id: "google/gemini-pro-1.5",
    name: "Gemini Pro 1.5 (via OpenRouter)",
    providerId: "openrouter",
    contextWindow: 1000000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 1.25,
    outputCostPer1M: 5,
  },
  {
    id: "meta-llama/llama-3-70b-instruct",
    name: "Llama 3 70B (via OpenRouter)",
    providerId: "openrouter",
    contextWindow: 8192,
    supportsToolCalling: false,
    supportsVision: false,
    supportsReasoningEffort: false,
    inputCostPer1M: 0.65,
    outputCostPer1M: 2.75,
  },
  {
    id: "mistralai/mixtral-8x22b-instruct",
    name: "Mixtral 8x22B (via OpenRouter)",
    providerId: "openrouter",
    contextWindow: 65536,
    supportsToolCalling: true,
    supportsVision: false,
    supportsReasoningEffort: false,
    inputCostPer1M: 0.65,
    outputCostPer1M: 2.75,
  },
];

interface OpenRouterMessage {
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

interface OpenRouterStreamChunk {
  id: string;
  choices: Array<{
    delta: { content?: string; role?: string; tool_calls?: unknown[] };
    finish_reason?: string;
  }>;
}

export class OpenRouterProvider extends BaseProvider {
  readonly id = "openrouter";
  readonly name = "OpenRouter";
  readonly supportsToolCalling = true;
  readonly supportsVision = true;
  readonly supportsReasoningEffort = false;
  readonly contextWindow = 128000; // Varies by model, use conservative default

  private baseUrl = "https://openrouter.ai/api/v1";

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
    const model = options?.model ?? "anthropic/claude-3.5-sonnet";
    const apiKey = this.getApiKey();

    const openRouterMessages = this.transformMessages(messages);
    const body: Record<string, unknown> = {
      model,
      messages: openRouterMessages,
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
          "HTTP-Referer": "https://altos.ai",
          "X-Title": "Altos Agent",
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
    const model = options?.model ?? "anthropic/claude-3.5-sonnet";
    const apiKey = this.getApiKey();

    const openRouterMessages = this.transformMessages(messages);
    const body: Record<string, unknown> = {
      model,
      messages: openRouterMessages,
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
          "HTTP-Referer": "https://altos.ai",
          "X-Title": "Altos Agent",
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
                const chunk = JSON.parse(jsonStr) as OpenRouterStreamChunk;
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

  private transformMessages(messages: Message[]): OpenRouterMessage[] {
    return messages.map((msg) => {
      const result: OpenRouterMessage = { role: msg.role, content: msg.content };
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
    // OpenRouter pricing varies by model; use rough averages
    const inputCost = (inputTokens / 1_000_000) * 2;
    const outputCost = (outputTokens / 1_000_000) * 8;
    return inputCost + outputCost;
  }
}
