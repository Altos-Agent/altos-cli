// @altos/ai - Anthropic provider adapter

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
  AssistantMessage,
} from "../index.js";
import { ProviderError } from "./error.js";

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    providerId: "anthropic",
    contextWindow: 200000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  {
    id: "claude-3-5-haiku",
    name: "Claude 3.5 Haiku",
    providerId: "anthropic",
    contextWindow: 200000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 0.8,
    outputCostPer1M: 4,
  },
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    providerId: "anthropic",
    contextWindow: 200000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 15,
    outputCostPer1M: 75,
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    providerId: "anthropic",
    contextWindow: 200000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
];

interface AnthropicMessage {
  role: "user" | "assistant";
  content: Array<{ type: string; [key: string]: unknown }>;
}

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";
  readonly supportsToolCalling = true;
  readonly supportsVision = true;
  readonly supportsReasoningEffort = false;
  readonly contextWindow = 200000;

  private baseUrl = "https://api.anthropic.com/v1";
  private anthropicVersion = "2023-06-01";

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
    const model = options?.model ?? "claude-3-5-sonnet";
    const apiKey = this.getApiKey();

    const { system, anthropicMessages, tools } = this.transformMessages(messages, options?.tools);

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
    };

    if (system) body.system = system;
    if (tools?.length) body.tools = tools;

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": this.anthropicVersion,
          "anthropic-dangerous-direct-browser-access": "true",
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
        content: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>;
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      const content = data.content.find((c) => c.type === "text")?.text ?? "";
      const toolCalls: ToolCall[] = data.content
        .filter((c) => c.type === "tool_use")
        .map((c) => ({
          id: c.id ?? "",
          type: "function" as const,
          function: {
            name: c.name ?? "",
            arguments: JSON.stringify(c.input ?? {}),
          },
        }));

      const usage: Usage = {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        estimatedCost: this.estimateCost(data.usage.input_tokens, data.usage.output_tokens),
      };

      return {
        content,
        model,
        finishReason: this.mapFinishReason(data.stop_reason),
        usage,
        toolCalls: toolCalls.length ? toolCalls : undefined,
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
    const model = options?.model ?? "claude-3-5-sonnet";
    const apiKey = this.getApiKey();

    const { system, anthropicMessages, tools } = this.transformMessages(messages, options?.tools);

    const body: Record<string, unknown> = {
      model,
      messages: anthropicMessages,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    };

    if (system) body.system = system;
    if (tools?.length) body.tools = tools;

    try {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": this.anthropicVersion,
          "anthropic-dangerous-direct-browser-access": "true",
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
            if (!trimmed) continue;

            if (trimmed.startsWith("data: ")) {
              const jsonStr = trimmed.slice(6);
              try {
                const chunk = JSON.parse(jsonStr) as {
                  type: string;
                  content?: Array<{
                    type: string;
                    text?: string;
                    name?: string;
                    input?: unknown;
                    id?: string;
                  }>;
                  usage?: { input_tokens: number; output_tokens: number };
                  stop_reason?: string;
                };

                if (chunk.type === "content_block_delta") {
                  const delta = chunk.content?.[0];
                  if (delta?.type === "text_delta" && delta.text) {
                    yield { type: "content", content: delta.text };
                  } else if (delta?.type === "tool_use_delta") {
                    yield {
                      type: "toolCall",
                      toolCall: {
                        id: delta.id ?? "",
                        type: "function",
                        function: {
                          name: delta.name ?? "",
                          arguments:
                            typeof delta.input === "string"
                              ? delta.input
                              : JSON.stringify(delta.input ?? {}),
                        },
                      },
                    };
                  }
                } else if (chunk.type === "message_delta" && chunk["stop_reason"]) {
                  yield { type: "done", finishReason: chunk["stop_reason"] };
                } else if (chunk.type === "message_stop") {
                  yield { type: "done", finishReason: "stop" };
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

  private transformMessages(messages: Message[], tools?: ToolDefinition[]) {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        system = system ? `${system}\n${msg.content}` : msg.content;
      } else if (msg.role === "user") {
        anthropicMessages.push({
          role: "user",
          content: [{ type: "text", text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        const assistantMsg = msg as AssistantMessage;
        const content: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }> = [];
        if (assistantMsg.content) content.push({ type: "text", text: assistantMsg.content });
        if (assistantMsg.toolCalls) {
          for (const tc of assistantMsg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
        }
        anthropicMessages.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        // Tool results go in the next user message
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId,
              content: msg.content,
            },
          ],
        });
      }
    }

    const transformedTools = tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));

    return { system, anthropicMessages, tools: transformedTools };
  }

  private mapFinishReason(reason: string): ChatResponse["finishReason"] {
    switch (reason) {
      case "end_turn":
        return "stop";
      case "max_tokens":
        return "length";
      case "stop_sequence":
        return "stop";
      case "tool_use":
        return "tool_use";
      default:
        return "stop";
    }
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * 3;
    const outputCost = (outputTokens / 1_000_000) * 15;
    return inputCost + outputCost;
  }
}
