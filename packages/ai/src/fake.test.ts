// @altos/ai - Fake provider tests

import { describe, it, expect, beforeEach } from "vitest";
import { FakeProvider, FakeProviderBuilder } from "./providers/fake.js";

describe("FakeProvider", () => {
  let provider: FakeProvider;

  beforeEach(() => {
    provider = new FakeProvider();
  });

  describe("listModels", () => {
    it("should return fake models", () => {
      const models = provider.listModels();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe("fake-gpt");
      expect(models[1].id).toBe("fake-claude");
    });

    it("should have correct provider id", () => {
      const models = provider.listModels();
      expect(models.every((m) => m.providerId === "fake")).toBe(true);
    });
  });

  describe("completeChat", () => {
    it("should return fake response", async () => {
      const messages = [{ role: "user" as const, content: "Hello" }];
      const response = await provider.completeChat(messages);

      expect(response.content).toBeTruthy();
      expect(response.model).toBe("fake-gpt");
      expect(response.finishReason).toBe("stop");
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
    });

    it("should respect model option", async () => {
      const messages = [{ role: "user" as const, content: "Hello" }];
      const response = await provider.completeChat(messages, { model: "fake-claude" });

      expect(response.model).toBe("fake-claude");
    });

    it("should track call count", async () => {
      expect(provider.getCallCount()).toBe(0);

      await provider.completeChat([{ role: "user", content: "test" }]);
      expect(provider.getCallCount()).toBe(1);

      await provider.completeChat([{ role: "user", content: "test" }]);
      expect(provider.getCallCount()).toBe(2);
    });

    it("should reset call count", async () => {
      await provider.completeChat([{ role: "user", content: "test" }]);
      provider.resetCallCount();
      expect(provider.getCallCount()).toBe(0);
    });

    it("should include tool calls when message mentions tool", async () => {
      const messages = [{ role: "user" as const, content: "Use a tool" }];
      const response = await provider.completeChat(messages);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.finishReason).toBe("tool_use");
    });
  });

  describe("streamChat", () => {
    it("should stream fake response", async () => {
      const messages = [{ role: "user" as const, content: "Hello" }];
      const chunks: string[] = [];

      for await (const chunk of provider.streamChat(messages)) {
        if (chunk.type === "content" && chunk.content) {
          chunks.push(chunk.content);
        }
        if (chunk.type === "done") {
          expect(chunk.finishReason).toBe("stop");
        }
      }

      expect(chunks.join("")).toBeTruthy();
    });

    it("should track call count for streaming", async () => {
      expect(provider.getCallCount()).toBe(0);

      const messages = [{ role: "user" as const, content: "Hello" }];
      for await (const _ of provider.streamChat(messages)) {
        // consume stream
      }

      expect(provider.getCallCount()).toBe(1);
    });
  });
});

describe("FakeProviderBuilder", () => {
  it("should build provider with delay", async () => {
    const start = Date.now();
    const provider = new FakeProviderBuilder().withDelay(100).build();

    await provider.completeChat([{ role: "user", content: "test" }]);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });

  it("should build provider with custom responses", async () => {
    const provider = new FakeProviderBuilder().withResponses(["First", "Second", "Third"]).build();

    const r1 = await provider.completeChat([{ role: "user", content: "test" }]);
    const r2 = await provider.completeChat([{ role: "user", content: "test" }]);
    const r3 = await provider.completeChat([{ role: "user", content: "test" }]);

    expect(r1.content).toBe("First");
    expect(r2.content).toBe("Second");
    expect(r3.content).toBe("Third");
  });

  it("should cycle responses", async () => {
    const provider = new FakeProviderBuilder().withResponses(["A", "B"]).build();

    const r1 = await provider.completeChat([{ role: "user", content: "test" }]);
    const r2 = await provider.completeChat([{ role: "user", content: "test" }]);
    const r3 = await provider.completeChat([{ role: "user", content: "test" }]);

    expect(r1.content).toBe("A");
    expect(r2.content).toBe("B");
    expect(r3.content).toBe("A"); // cycles back
  });

  it("should build provider with model-specific responses", async () => {
    const provider = new FakeProviderBuilder()
      .withModelResponse("fake-claude", "Claude response")
      .withModelResponse("fake-gpt", "GPT response")
      .build();

    const r1 = await provider.completeChat([{ role: "user", content: "test" }], {
      model: "fake-gpt",
    });
    const r2 = await provider.completeChat([{ role: "user", content: "test" }], {
      model: "fake-claude",
    });

    expect(r1.content).toBe("GPT response");
    expect(r2.content).toBe("Claude response");
  });

  it("should build provider with error rate", async () => {
    // Use 100% error rate for predictable testing
    const provider = new FakeProviderBuilder().withErrorRate(1.0).build();

    const response = await provider.completeChat([{ role: "user", content: "test" }]);

    expect(response.error).toBeDefined();
    expect(response.finishReason).toBe("error");
  });
});
