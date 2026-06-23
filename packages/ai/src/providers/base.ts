// @altos/ai - Base provider class with common functionality

import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelInfo,
  ModelProvider,
  StreamChunk,
} from "../index.js";
import { ProviderError } from "./error.js";

export abstract class BaseProvider implements ModelProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly supportsToolCalling: boolean;
  abstract readonly supportsVision: boolean;
  abstract readonly supportsReasoningEffort: boolean;
  abstract readonly contextWindow: number;
  abstract listModels(): ModelInfo[];

  constructor(protected apiKey?: string) {}

  protected getApiKey(): string {
    if (!this.apiKey) {
      throw new Error(
        `[${this.id}] API key not configured. Set ${this.id.toUpperCase()}_API_KEY or provide apiKey option.`,
      );
    }
    return this.apiKey;
  }

  protected createProviderError(
    message: string,
    statusCode?: number,
    isRetryable = false,
  ): ProviderError {
    return new ProviderError(message, this.id, statusCode, isRetryable);
  }

  protected sanitizeApiKey(key: string): string {
    if (key.length <= 8) return "***";
    return key.slice(0, 4) + "..." + key.slice(-4);
  }

  async completeChat(_messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
    throw new Error("Not implemented");
  }

  async *streamChat(
    _messages: Message[],
    _options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    throw new Error("Not implemented");
  }

  protected createErrorResponse(error: unknown, model: string): ChatResponse {
    if (error instanceof ProviderError) {
      return {
        content: "",
        model,
        finishReason: "error",
        usage: { inputTokens: 0, outputTokens: 0 },
        error: error.toUserMessage(),
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: "",
      model,
      finishReason: "error",
      usage: { inputTokens: 0, outputTokens: 0 },
      error: `[${this.id}] ${message}`,
    };
  }

  protected estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}
