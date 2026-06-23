// @altos/core - Fake Model Adapter for testing

import type { ModelConfig, ToolCall } from "../events/types.js";

/**
 * Response from the fake model
 */
export interface FakeModelResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length";
}

/**
 * A fake model adapter that returns deterministic responses for testing.
 *
 * This adapter is useful for:
 * - Unit tests that need reproducible agent behavior
 * - Development without API credentials
 * - Testing event flow and session management
 */
export class FakeModelAdapter {
  private responses: FakeModelResponse[];
  private currentIndex: number = 0;
  private delay: number; // ms to simulate latency

  constructor(
    options: {
      responses?: FakeModelResponse[];
      delay?: number;
    } = {},
  ) {
    this.responses = options.responses ?? [
      { content: "Hello! I'm Altos. How can I help you?", finishReason: "stop" },
    ];
    this.delay = options.delay ?? 0;
  }

  /**
   * Set the responses to return
   */
  setResponses(responses: FakeModelResponse[]): void {
    this.responses = responses;
    this.currentIndex = 0;
  }

  /**
   * Add a response to the queue
   */
  addResponse(response: FakeModelResponse): void {
    this.responses.push(response);
  }

  /**
   * Call the model with a prompt and context
   */
  async call(
    _messages: Array<{ role: string; content: string }>,
    _config: ModelConfig,
  ): Promise<FakeModelResponse> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.currentIndex >= this.responses.length) {
      // Cycle back to the first response if we run out
      this.currentIndex = 0;
    }

    const response = this.responses[this.currentIndex];
    this.currentIndex++;
    return response;
  }

  /**
   * Stream responses (returns async generator for compatibility)
   */
  async *stream(
    _messages: Array<{ role: string; content: string }>,
    _config: ModelConfig,
  ): AsyncGenerator<string, FakeModelResponse, unknown> {
    const response = await this.call(_messages, _config);

    // Stream character by character
    for (const char of response.content) {
      yield char;
    }

    return response;
  }

  /**
   * Reset the adapter state
   */
  reset(): void {
    this.currentIndex = 0;
  }
}

/**
 * Pre-built fake responses for common test scenarios
 */
export const FakeResponses = {
  /**
   * Simple greeting response
   */
  greeting(): FakeModelResponse {
    return {
      content: "Hello! I'm Altos. How can I help you today?",
      finishReason: "stop",
    };
  },

  /**
   * Response that requests a tool call
   */
  withToolCall(toolName: string, args: Record<string, unknown>): FakeModelResponse {
    return {
      content: `I'll use the ${toolName} tool to help with that.`,
      toolCalls: [
        {
          id: `tool_call_${Date.now()}`,
          name: toolName,
          arguments: args,
        },
      ],
      finishReason: "tool_calls",
    };
  },

  /**
   * Response that performs multiple tool calls
   */
  withMultipleToolCalls(
    calls: Array<{ name: string; args: Record<string, unknown> }>,
  ): FakeModelResponse {
    return {
      content: "Let me do several things for you.",
      toolCalls: calls.map((call, i) => ({
        id: `tool_call_${Date.now()}_${i}`,
        name: call.name,
        arguments: call.args,
      })),
      finishReason: "tool_calls",
    };
  },

  /**
   * Response that fails with an error
   */
  error(message: string): FakeModelResponse {
    return {
      content: `I encountered an error: ${message}`,
      finishReason: "stop",
    };
  },

  /**
   * Multi-turn conversation responses
   */
  conversation(responses: string[]): FakeModelResponse[] {
    return responses.map((content) => ({
      content,
      finishReason: "stop" as const,
    }));
  },
};

/**
 * Create a fake model adapter for a specific test scenario
 */
export function createFakeAdapter(
  scenario: "greeting" | "tool_call" | "error" | "multi_turn",
): FakeModelAdapter {
  switch (scenario) {
    case "greeting":
      return new FakeModelAdapter({ responses: [FakeResponses.greeting()] });
    case "tool_call":
      return new FakeModelAdapter({
        responses: [FakeResponses.withToolCall("read_file", { path: "/test.txt" })],
      });
    case "error":
      return new FakeModelAdapter({
        responses: [FakeResponses.error("Test error")],
      });
    case "multi_turn":
      return new FakeModelAdapter({
        responses: FakeResponses.conversation([
          "Hello! How can I help?",
          "Let me think about that...",
          "Based on my analysis, here's what I found.",
          "Is there anything else you'd like me to help with?",
        ]),
      });
    default:
      return new FakeModelAdapter();
  }
}
