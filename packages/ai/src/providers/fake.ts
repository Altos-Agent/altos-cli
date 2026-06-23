// @altos/ai - Fake provider for testing

import { BaseProvider } from "./base.js";
import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelInfo,
  StreamChunk,
  ToolCall,
  Usage,
} from "../index.js";

const FAKE_MODELS: ModelInfo[] = [
  {
    id: "fake-gpt",
    name: "Fake GPT",
    providerId: "fake",
    contextWindow: 128000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: true,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
  },
  {
    id: "fake-claude",
    name: "Fake Claude",
    providerId: "fake",
    contextWindow: 200000,
    supportsToolCalling: true,
    supportsVision: true,
    supportsReasoningEffort: false,
    inputCostPer1M: 0,
    outputCostPer1M: 0,
  },
];

export interface FakeProviderOptions {
  delay?: number; // ms to delay responses
  errorRate?: number; // 0-1 probability of error
  responses?: string[]; // predefined responses (cycles through)
  modelResponses?: Record<string, string>; // model-specific responses
}

export class FakeProvider extends BaseProvider {
  readonly id = "fake";
  readonly name = "Fake Provider";
  readonly supportsToolCalling = true;
  readonly supportsVision = true;
  readonly supportsReasoningEffort = true;
  readonly contextWindow = 128000;

  private responseIndex = 0;
  private callCount = 0;

  constructor(private options: FakeProviderOptions = {}) {
    super(undefined);
  }

  listModels(): ModelInfo[] {
    return FAKE_MODELS;
  }

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  async completeChat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.callCount++;
    const model = options?.model ?? "fake-gpt";

    if (this.options.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    if (this.options.errorRate && Math.random() < this.options.errorRate) {
      return {
        content: "",
        model,
        finishReason: "error",
        usage: { inputTokens: 0, outputTokens: 0 },
        error: "[fake] Random test error",
      };
    }

    const content = this.getResponse(model);
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // Check if we should simulate tool calls
    const toolCalls: ToolCall[] | undefined = lastUserMessage.toLowerCase().includes("tool")
      ? [
          {
            id: "call_fake_123",
            type: "function",
            function: { name: "fake_function", arguments: '{"input":"test"}' },
          },
        ]
      : undefined;

    const usage: Usage = {
      inputTokens: this.estimateTokens(JSON.stringify(messages)),
      outputTokens: this.estimateTokens(content),
      estimatedCost: 0,
    };

    return {
      content,
      model,
      finishReason: toolCalls ? "tool_use" : "stop",
      usage,
      toolCalls,
    };
  }

  async *streamChat(
    _messages: Message[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    this.callCount++;
    const model = options?.model ?? "fake-gpt";

    if (this.options.delay) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    const content = this.getResponse(model);
    const words = content.split(" ");

    for (let i = 0; i < words.length; i++) {
      yield { type: "content", content: words[i] + (i < words.length - 1 ? " " : "") };
      if (this.options.delay) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min((this.options.delay ?? 0) / words.length, 50)),
        );
      }
    }

    yield { type: "done", finishReason: "stop" };
  }

  private getResponse(model: string): string {
    // Check for model-specific response
    if (this.options.modelResponses?.[model]) {
      return this.options.modelResponses[model];
    }

    // Cycle through predefined responses
    if (this.options.responses?.length) {
      const response = this.options.responses[this.responseIndex % this.options.responses.length];
      this.responseIndex++;
      return response;
    }

    // Default responses
    return `This is a fake response from ${model} for testing purposes.`;
  }
}

// Builder for creating configured fake providers
export class FakeProviderBuilder {
  private options: FakeProviderOptions = {};

  withDelay(delay: number): this {
    this.options.delay = delay;
    return this;
  }

  withErrorRate(rate: number): this {
    this.options.errorRate = Math.max(0, Math.min(1, rate));
    return this;
  }

  withResponses(responses: string[]): this {
    this.options.responses = responses;
    return this;
  }

  withModelResponse(model: string, response: string): this {
    this.options.modelResponses = {
      ...this.options.modelResponses,
      [model]: response,
    };
    return this;
  }

  build(): FakeProvider {
    return new FakeProvider(this.options);
  }
}
