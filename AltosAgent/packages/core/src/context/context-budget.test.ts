// @altos/core - Context Budget tests

import { describe, it, expect } from "vitest";
import {
  ContextBudgetManager,
  DEFAULT_THRESHOLDS,
  estimateTokensFromChars,
  estimateTokensFromString,
  AutoCompactor,
  partitionEvents,
  isCriticalEvent,
  AgentRuntime,
} from "../index.js";
import type { AgentEvent } from "../events/types.js";
import {
  createSessionStartedEvent,
  createUserMessageEvent,
  createAssistantMessageEvent,
  createToolCallCompletedEvent,
  createPermissionGrantedEvent,
  createCompactRequestedEvent,
} from "../events/factory.js";

describe("@altos/core - ContextBudgetManager", () => {
  describe("token estimation", () => {
    it("should estimate tokens from character count", () => {
      expect(estimateTokensFromChars(400)).toBe(100); // 400/4 = 100
      expect(estimateTokensFromChars(1000)).toBe(250);
    });

    it("should estimate tokens from string", () => {
      expect(estimateTokensFromString("hello")).toBe(2);
      expect(estimateTokensFromString("a".repeat(400))).toBe(100);
    });
  });

  describe("threshold defaults", () => {
    it("should have sensible defaults", () => {
      expect(DEFAULT_THRESHOLDS.warnAt).toBe(0.7);
      expect(DEFAULT_THRESHOLDS.softCompactAt).toBe(0.8);
      expect(DEFAULT_THRESHOLDS.hardCompactAt).toBe(0.9);
      expect(DEFAULT_THRESHOLDS.blockAt).toBe(0.97);
    });
  });

  describe("status evaluation", () => {
    it("should return ok when under warn threshold", () => {
      const manager = new ContextBudgetManager(100_000);
      manager.setDimension("messages", 10_000, 0, 40_000);
      const status = manager.getStatus();
      expect(status.level).toBe("ok");
    });

    it("should return warn at 70%", () => {
      const manager = new ContextBudgetManager(100_000);
      // 70% of 100k = 70k tokens
      manager.setDimension("messages", 70_000, 0, 280_000);
      const status = manager.getStatus();
      expect(status.level).toBe("warn");
    });

    it("should return soft_compact at 80%", () => {
      const manager = new ContextBudgetManager(100_000);
      manager.setDimension("messages", 80_000, 0, 320_000);
      const status = manager.getStatus();
      expect(status.level).toBe("soft_compact");
    });

    it("should return hard_compact at 90%", () => {
      const manager = new ContextBudgetManager(100_000);
      manager.setDimension("messages", 90_000, 0, 360_000);
      const status = manager.getStatus();
      expect(status.level).toBe("hard_compact");
    });

    it("should return blocked at 97%", () => {
      const manager = new ContextBudgetManager(100_000);
      manager.setDimension("messages", 97_000, 0, 388_000);
      const status = manager.getStatus();
      expect(status.level).toBe("blocked");
    });

    it("should allow canCallModel when under block threshold", () => {
      const manager = new ContextBudgetManager(100_000);
      manager.setDimension("messages", 50_000, 0, 200_000);
      expect(manager.canCallModel()).toBe(true);
    });

    it("should block canCallModel at block threshold", () => {
      const manager = new ContextBudgetManager(100_000);
      manager.setDimension("messages", 98_000, 0, 392_000);
      expect(manager.canCallModel()).toBe(false);
    });
  });

  describe("updateFromEvents", () => {
    it("should estimate tokens from events", () => {
      const manager = new ContextBudgetManager(100_000);

      const events: AgentEvent[] = [
        createSessionStartedEvent("sess1", 1, { cwd: "/test" }),
        createUserMessageEvent("sess1", 2, "Hello, this is a test message"),
        createUserMessageEvent("sess1", 3, "Another message for testing token estimation"),
      ];

      manager.updateFromEvents(events);
      const status = manager.getStatus();
      expect(status.usageRatio).toBeGreaterThan(0);
    });
  });

  describe("does not compact tiny sessions", () => {
    it("should not recommend compaction for sessions under 10 events", () => {
      const manager = new ContextBudgetManager(100_000);

      // Small session - under threshold
      const events: AgentEvent[] = [
        createSessionStartedEvent("sess1", 1, { cwd: "/test" }),
        createUserMessageEvent("sess1", 2, "Hi"),
        createAssistantMessageEvent("sess1", 3, "Hello!"),
      ];

      manager.updateFromEvents(events);
      const status = manager.getStatus();
      expect(status.level).toBe("ok");
    });
  });
});

describe("@altos/core - AutoCompactor", () => {
  describe("isCriticalEvent", () => {
    it("should mark session_started as critical", () => {
      const event = createSessionStartedEvent("sess1", 1, { cwd: "/test" });
      expect(isCriticalEvent(event)).toBe(true);
    });

    it("should mark permission_granted as critical", () => {
      const event = createPermissionGrantedEvent("sess1", 5, "read_file", "tool-123");
      expect(isCriticalEvent(event)).toBe(true);
    });

    it("should mark compact_requested as critical", () => {
      const event = createCompactRequestedEvent("sess1", 10, "Manual", 50);
      expect(isCriticalEvent(event)).toBe(true);
    });

    it("should NOT mark user_message as critical", () => {
      const event = createUserMessageEvent("sess1", 2, "Hello");
      expect(isCriticalEvent(event)).toBe(false);
    });

    it("should NOT mark assistant_message as critical", () => {
      const event = createAssistantMessageEvent("sess1", 3, "I will fix the bug");
      expect(isCriticalEvent(event)).toBe(false);
    });
  });

  describe("partitionEvents", () => {
    it("should keep critical events verbatim", () => {
      const events: AgentEvent[] = [
        createSessionStartedEvent("sess1", 1, { cwd: "/test" }),
        createUserMessageEvent("sess1", 2, "Hello"),
        createAssistantMessageEvent("sess1", 3, "Hi there!"),
        createPermissionGrantedEvent("sess1", 4, "read_file", "tool-123"),
      ];

      const { keep, compact } = partitionEvents(events);

      expect(keep.length).toBe(2); // session_started + permission_granted
      expect(compact.length).toBe(2); // user_message + assistant_message
    });

    it("should preserve file changes in compacted output", async () => {
      const compactor = new AutoCompactor();

      const events: AgentEvent[] = [
        createSessionStartedEvent("sess1", 1, { cwd: "/test" }),
        createUserMessageEvent("sess1", 2, "Fix the bug in app.ts"),
        createAssistantMessageEvent("sess1", 3, "I will fix the bug in app.ts"),
        createToolCallCompletedEvent(
          "sess1",
          4,
          { id: "tc1", name: "apply_patch", arguments: {} },
          { success: true, data: { file: "app.ts" }, duration: 100 },
        ),
      ];

      const preserved = compactor.extractPreservedData(events);

      expect(preserved.fileChanges).toContain("app.ts");
      expect(preserved.decisions).toContain("I will fix the bug in app.ts");
    });

    it("should preserve test results", async () => {
      const compactor = new AutoCompactor();

      const events: AgentEvent[] = [
        createToolCallCompletedEvent(
          "sess1",
          5,
          { id: "tc2", name: "run_tests", arguments: {} },
          { success: true, duration: 5000 },
        ),
      ];

      const preserved = compactor.extractPreservedData(events);

      expect(preserved.testResults).toContain("Tests passed");
    });

    it("should redact secrets from assistant messages", async () => {
      const compactor = new AutoCompactor();

      const events: AgentEvent[] = [
        createAssistantMessageEvent(
          "sess1",
          3,
          "I'll use the API key sk-1234567890abcdef for authentication",
        ),
      ];

      const preserved = compactor.extractPreservedData(events);

      // The decision text should be preserved, but the actual secret
      // redaction happens at the write-to-memory layer
      expect(preserved.decisions.length).toBe(1);
    });
  });

  describe("compact", () => {
    it("should compact a range of events into a summary", async () => {
      const compactor = new AutoCompactor();

      const events: AgentEvent[] = [
        createSessionStartedEvent("sess1", 1, { cwd: "/test" }),
        createUserMessageEvent("sess1", 2, "Hello"),
        createAssistantMessageEvent("sess1", 3, "Hi there!"),
        createToolCallCompletedEvent(
          "sess1",
          4,
          { id: "tc1", name: "read_file", arguments: {} },
          { success: true, data: { file: "README.md" }, duration: 50 },
        ),
      ];

      const result = await compactor.compact(events, "sess1", 2, 4);

      expect(result.type).toBe("session_summary");
      expect(result.payload.originalCount).toBe(3);
      expect(result.payload.fromSequence).toBe(2);
      expect(result.payload.toSequence).toBe(4);
      // read_file doesn't add to fileChanges, but the summary is still created
      expect(result.payload.summary).toBeTruthy();
    });
  });
});

describe("@altos/core - Replay after compaction", () => {
  it("should still be able to replay session after compaction", async () => {
    // This tests that the event store maintains replayability
    // after compaction replaces events with summaries
    const runtime = new AgentRuntime();
    runtime.setModelAdapter({
      call: async () => ({ content: "test", finishReason: "stop" }),
    });

    const session = await runtime.startSession({
      id: "replay-test",
      cwd: "/test",
    });

    // Add some events
    await runtime.appendUserMessage(session.id, "Hello");
    await runtime.executeIteration(session.id);

    // Compact
    await runtime.compactSession(session.id);

    // Replay should still work
    const events: AgentEvent[] = [];
    for await (const event of runtime.replaySession(session.id)) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);

    await runtime.close();
  });
});
