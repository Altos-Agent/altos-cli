// @altos/ai - Local/Ollama-compatible provider adapter

import { BaseProvider } from "./base.js";
import {
  ChatOptions,
  ChatResponse,
  Message,
  ModelInfo,
  StreamChunk,
  ToolCall,
  Usage,
} from "../index.js";
import { ProviderError } from "./error.js";

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "llama3",
    name: "Llama 3",
    providerId: "local",
    contextWindow: 8192,
    supportsToolCalling: false,
    supportsVision: false,
    supportsReasoningEffort: false,
  },
  {
    id: "llama3.1",
    name: "Llama 3.1",
    providerId: "local",
    contextWindow: 128000,
    supportsToolCalling: false,
    supportsVision: false,
    supportsReasoningEffort: false,
  },
  {
    id: "mistral",
    name: "Mistral",
    providerId: "local",
    contextWindow: 8192,
    supportsToolCalling: false,
    supportsVision: false,
    supportsReasoningEffort: false,
  },
  {
    id: "codellama",
    name: "Code Llama",
    providerId: "local",
    contextWindow: 16384,
    supportsToolCalling: false,
    supportsVision: false,
    supportsReasoningEffort: false,
  },
  {
    id: "phi3",
    name: "Phi-3",
    providerId: "local",
    contextWindow: 4096,
    supportsToolCalling: false,
    supportsVision: false,
    supportsReasoningEffort: false,
  },
];

interface OllamaMessage {
  role: string;
  content: string;
  images?: string[];
}

interface OllamaStreamResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  tool_calls?: Array<{
    function: { name: string; arguments: string };
  }>;
}

export class LocalProvider extends BaseProvider {
  readonly id = "local";
  readonly name = "Local (Ollama)";
  readonly supportsToolCalling = false;
  readonly supportsVision = false;
  readonly supportsReasoningEffort = false;
  readonly contextWindow = 8192;

  private baseUrl = "http://localhost:11434";

  constructor(apiKey?: string, baseUrl?: string) {
    super(apiKey);
    if (baseUrl) {
      (this as unknown as { baseUrl: string }).baseUrl = baseUrl;
    }
  }

  listModels(): ModelInfo[] {
    return DEFAULT_MODELS;
  }

  protected getApiKey(): string {
    // Local provider doesn't require API key
    return "local";
  }

  async completeChat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? "llama3";
    const apiKey = this.getApiKey();

    const ollamaMessages = this.transformMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: false,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.options = { num_predict: options.maxTokens };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
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
          `Ollama request failed: ${error}`,
          response.status,
          response.status >= 500,
        );
      }

      const data = (await response.json()) as {
        message: { content: string; tool_calls?: ToolCall[] };
        total_duration?: number;
      };

      const usage: Usage = {
        inputTokens: this.estimateTokens(JSON.stringify(ollamaMessages)),
        outputTokens: this.estimateTokens(data.message.content),
        estimatedCost: 0, // Local models are free
      };

      return {
        content: data.message.content ?? "",
        model,
        finishReason: "stop",
        usage,
        toolCalls: data.message.tool_calls,
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
    const model = options?.model ?? "llama3";
    const apiKey = this.getApiKey();

    const ollamaMessages = this.transformMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: true,
    };

    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.maxTokens !== undefined) body.options = { num_predict: options.maxTokens };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
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
          `Ollama request failed: ${error}`,
          response.status,
          response.status >= 500,
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

            try {
              const chunk = JSON.parse(trimmed) as OllamaStreamResponse;

              if (chunk.response) {
                yield { type: "content", content: chunk.response };
              }

              if (chunk.done) {
                yield { type: "done", finishReason: "stop" };
              }
            } catch {
              // Skip malformed JSON
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

  private transformMessages(messages: Message[]): OllamaMessage[] {
    return messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => {
        const result: OllamaMessage = { role: msg.role, content: msg.content };
        return result;
      });
  }
}
