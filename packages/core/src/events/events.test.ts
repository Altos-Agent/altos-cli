// @altos/core - Core event model tests

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSessionStartedEvent,
  createUserMessageEvent,
  createAssistantMessageEvent,
  createToolCallRequestedEvent,
  createToolCallCompletedEvent,
  createToolCallFailedEvent,
  createPermissionGrantedEvent,
  createPermissionDeniedEvent,
  createSessionCompletedEvent,
  createErrorEvent,
  serializeEvent,
  deserializeEvent,
  getEventMetadata,
  type AgentEvent,
  type ToolCall,
} from "../index.js";
import { InMemoryEventStore } from "../store/index.js";
import { AgentSession } from "../session/session.js";

describe("@altos/core - Event Model", () => {
  describe("Event Creation", () => {
    it("should create session_started event", () => {
      const event = createSessionStartedEvent("sess_1", 1, {
        model: "gpt-4",
        cwd: "/test",
      });

      expect(event.type).toBe("session_started");
      expect(event.sessionId).toBe("sess_1");
      expect(event.sequence).toBe(1);
      expect(event.payload.model).toBe("gpt-4");
      expect(event.payload.cwd).toBe("/test");
      expect(event.id).toMatch(/^evt_/);
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it("should create user_message event", () => {
      const event = createUserMessageEvent("sess_1", 2, "Hello, world!");

      expect(event.type).toBe("user_message");
      expect(event.payload.content).toBe("Hello, world!");
    });

    it("should create assistant_message event", () => {
      const toolCalls: ToolCall[] = [
        { id: "tc_1", name: "read_file", arguments: { path: "/test.txt" } },
      ];
      const event = createAssistantMessageEvent("sess_1", 3, "I'll read that file.", toolCalls);

      expect(event.type).toBe("assistant_message");
      expect(event.payload.content).toBe("I'll read that file.");
      expect(event.payload.toolCalls).toHaveLength(1);
      expect(event.payload.toolCalls![0].name).toBe("read_file");
    });

    it("should create tool_call events", () => {
      const toolCall: ToolCall = { id: "tc_1", name: "bash", arguments: { command: "ls" } };

      const requested = createToolCallRequestedEvent("sess_1", 4, toolCall);
      expect(requested.type).toBe("tool_call_requested");

      const completed = createToolCallCompletedEvent("sess_1", 5, toolCall, {
        success: true,
        data: ["file1.txt", "file2.txt"],
        duration: 100,
      });
      expect(completed.type).toBe("tool_call_completed");
      expect(completed.payload.result.success).toBe(true);
      expect(completed.payload.result.data).toEqual(["file1.txt", "file2.txt"]);

      const failed = createToolCallFailedEvent("sess_1", 6, toolCall, "Permission denied", 50);
      expect(failed.type).toBe("tool_call_failed");
      expect(failed.payload.error).toBe("Permission denied");
    });

    it("should create permission events", () => {
      const granted = createPermissionGrantedEvent("sess_1", 7, "read:/tmp", "tc_1");
      expect(granted.type).toBe("permission_granted");
      expect(granted.payload.permission).toBe("read:/tmp");

      const denied = createPermissionDeniedEvent(
        "sess_1",
        8,
        "write:/etc",
        "tc_2",
        "Too dangerous",
      );
      expect(denied.type).toBe("permission_denied");
      expect(denied.payload.reason).toBe("Too dangerous");
    });

    it("should create error event", () => {
      const event = createErrorEvent("sess_1", 9, "TOOL_NOT_FOUND", "Tool 'xyz' not found", false, {
        toolName: "xyz",
      });

      expect(event.type).toBe("error");
      expect(event.payload.code).toBe("TOOL_NOT_FOUND");
      expect(event.payload.recoverable).toBe(false);
      expect(event.payload.context?.toolName).toBe("xyz");
    });

    it("should create session_completed event", () => {
      const event = createSessionCompletedEvent("sess_1", 10, "User requested exit", 10, 60000);

      expect(event.type).toBe("session_completed");
      expect(event.payload.reason).toBe("User requested exit");
      expect(event.payload.totalEvents).toBe(10);
      expect(event.payload.duration).toBe(60000);
    });
  });

  describe("Event Serialization", () => {
    it("should serialize and deserialize events", () => {
      const original = createUserMessageEvent("sess_1", 1, "Test message");
      const serialized = serializeEvent(original);
      const deserialized = deserializeEvent(serialized);

      expect(deserialized).toEqual(original);
      expect(deserialized.type).toBe("user_message");
      expect((deserialized as typeof original).payload.content).toBe("Test message");
    });

    it("should preserve all fields through serialization", () => {
      const toolCall: ToolCall = { id: "tc_1", name: "test", arguments: { key: "value" } };
      const event = createToolCallCompletedEvent("sess_1", 5, toolCall, {
        success: true,
        data: { nested: { value: 42 } },
        duration: 123,
      });

      const json = serializeEvent(event);
      const parsed = deserializeEvent(json) as typeof event;

      expect(parsed.payload.result.data).toEqual({ nested: { value: 42 } });
    });
  });

  describe("Event Metadata", () => {
    it("should extract metadata from event", () => {
      const event = createUserMessageEvent("sess_123", 42, "Hello");
      const metadata = getEventMetadata(event);

      expect(metadata.id).toBe(event.id);
      expect(metadata.sessionId).toBe("sess_123");
      expect(metadata.type).toBe("user_message");
      expect(metadata.sequence).toBe(42);
      expect(metadata.timestamp).toBe(event.timestamp);
    });
  });
});

describe("@altos/core - EventStore", () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  afterEach(async () => {
    await store.close();
  });

  describe("append", () => {
    it("should append events and auto-assign sequence", () => {
      const event1 = createUserMessageEvent("sess_1", 0, "First");
      const event2 = createUserMessageEvent("sess_1", 0, "Second");

      const stored1 = store.append(event1);
      const stored2 = store.append(event2);

      expect(stored1.sequence).toBe(1);
      expect(stored2.sequence).toBe(2);
    });

    it("should maintain sequence for same session", () => {
      for (let i = 0; i < 5; i++) {
        store.append(createUserMessageEvent("sess_1", 0, `Message ${i}`));
      }

      expect(store.getLatestSequence("sess_1")).toBe(5);
    });

    it("should handle multiple sessions independently", () => {
      store.append(createUserMessageEvent("sess_1", 0, "Sess1 msg"));
      store.append(createUserMessageEvent("sess_2", 0, "Sess2 msg"));
      store.append(createUserMessageEvent("sess_1", 0, "Sess1 msg 2"));
      store.append(createUserMessageEvent("sess_2", 0, "Sess2 msg 2"));

      expect(store.getLatestSequence("sess_1")).toBe(2);
      expect(store.getLatestSequence("sess_2")).toBe(2);
      expect(store.getEventCount("sess_1")).toBe(2);
      expect(store.getEventCount("sess_2")).toBe(2);
    });
  });

  describe("list", () => {
    beforeEach(() => {
      // Set up test data
      for (let i = 0; i < 3; i++) {
        store.append(createUserMessageEvent("sess_1", 0, `User msg ${i}`));
        store.append(createAssistantMessageEvent("sess_1", 0, `Assistant msg ${i}`));
      }
    });

    it("should list all events for a session", () => {
      const events = store.list("sess_1");
      expect(events).toHaveLength(6);
    });

    it("should filter by event type", () => {
      const userEvents = store.list("sess_1", { types: ["user_message"] });
      expect(userEvents).toHaveLength(3);
      expect(userEvents.every((e) => e.type === "user_message")).toBe(true);
    });

    it("should filter by time range", () => {
      const beforeTime = Date.now() + 1000;
      store.append(createUserMessageEvent("sess_1", 0, "Future msg"));

      const pastEvents = store.list("sess_1", { before: beforeTime });
      expect(pastEvents.every((e) => e.timestamp < beforeTime)).toBe(true);
    });

    it("should respect limit", () => {
      const limited = store.list("sess_1", { limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it("should return empty array for non-existent session", () => {
      const events = store.list("nonexistent");
      expect(events).toHaveLength(0);
    });
  });

  describe("replay", () => {
    it("should replay events in sequence order", async () => {
      store.append(createUserMessageEvent("sess_1", 0, "First"));
      store.append(createAssistantMessageEvent("sess_1", 0, "Second"));
      store.append(createUserMessageEvent("sess_1", 0, "Third"));

      const replayed: AgentEvent[] = [];
      for await (const event of store.replay("sess_1")) {
        replayed.push(event);
      }

      expect(replayed).toHaveLength(3);
      // Verify sequence order
      expect(replayed[0].sequence).toBeLessThan(replayed[1].sequence);
      expect(replayed[1].sequence).toBeLessThan(replayed[2].sequence);
    });

    it("should only replay events for specified session", async () => {
      store.append(createUserMessageEvent("sess_1", 0, "Sess1"));
      store.append(createUserMessageEvent("sess_2", 0, "Sess2"));
      store.append(createUserMessageEvent("sess_1", 0, "Sess1 again"));

      const replayed: AgentEvent[] = [];
      for await (const event of store.replay("sess_1")) {
        replayed.push(event);
      }

      expect(replayed).toHaveLength(2);
      expect(replayed.every((e) => e.sessionId === "sess_1")).toBe(true);
    });
  });

  describe("clearSession", () => {
    it("should clear all events for a session", () => {
      store.append(createUserMessageEvent("sess_1", 0, "msg"));
      store.append(createUserMessageEvent("sess_2", 0, "msg"));

      store.clearSession("sess_1");

      expect(store.getEventCount("sess_1")).toBe(0);
      expect(store.getEventCount("sess_2")).toBe(1);
    });
  });
});

describe("@altos/core - Session Lifecycle", () => {
  it("should create session with correct initial state", () => {
    const session = new AgentSession("sess_1", "/test", { model: "gpt-4" });

    expect(session.id).toBe("sess_1");
    expect(session.cwd).toBe("/test");
    expect(session.status).toBe("created");
    expect(session.modelConfig.model).toBe("gpt-4");
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.updatedAt).toBe(session.createdAt);
  });

  it("should track session status transitions", () => {
    const session = new AgentSession("sess_1", "/test");

    session.start();
    expect(session.status).toBe("running");

    session.waitForPermission();
    expect(session.status).toBe("waiting_for_permission");

    session.resumeFromPermission();
    expect(session.status).toBe("running");

    session.executingTool();
    expect(session.status).toBe("executing_tool");

    session.complete();
    expect(session.status).toBe("completed");
  });

  it("should append events to session", () => {
    const session = new AgentSession("sess_1", "/test");
    session.start();

    const event = createUserMessageEvent("sess_1", 0, "Hello");
    const stored = session.appendEvent(event);

    expect(stored.sequence).toBe(1);
    expect(session.getEventCount()).toBe(1);
  });

  it("should list events with filtering", () => {
    const session = new AgentSession("sess_1", "/test");
    session.start();

    session.appendEvent(createUserMessageEvent("sess_1", 0, "User 1"));
    session.appendEvent(createAssistantMessageEvent("sess_1", 0, "Assistant 1"));
    session.appendEvent(createUserMessageEvent("sess_1", 0, "User 2"));

    const all = session.listEvents();
    expect(all).toHaveLength(3);

    const userOnly = session.listEvents({ types: ["user_message"] });
    expect(userOnly).toHaveLength(2);
  });

  it("should replay events in order", async () => {
    const session = new AgentSession("sess_1", "/test");
    session.start();

    session.appendEvent(createUserMessageEvent("sess_1", 0, "First"));
    session.appendEvent(createAssistantMessageEvent("sess_1", 0, "Second"));

    const replayed: AgentEvent[] = [];
    for await (const event of session.replayEvents()) {
      replayed.push(event);
    }

    expect(replayed).toHaveLength(2);
    expect(replayed[0].sequence).toBeLessThan(replayed[1].sequence);
  });

  it("should generate session summary", () => {
    const session = new AgentSession("sess_1", "/test", { model: "gpt-4" });
    session.start();
    session.appendEvent(createUserMessageEvent("sess_1", 0, "Test"));

    const summary = session.toSummary();

    expect(summary.id).toBe("sess_1");
    expect(summary.cwd).toBe("/test");
    expect(summary.status).toBe("running");
    expect(summary.eventCount).toBe(1);
    expect(summary.modelConfig.model).toBe("gpt-4");
  });
});

describe("@altos/core - Failed Tool Call Recording", () => {
  it("should record tool call failure with error details", () => {
    const toolCall: ToolCall = {
      id: "tc_failed",
      name: "dangerous_operation",
      arguments: { path: "/system" },
    };

    const failedEvent = createToolCallFailedEvent(
      "sess_1",
      5,
      toolCall,
      "Permission denied: cannot access /system",
      45,
    );

    expect(failedEvent.type).toBe("tool_call_failed");
    expect(failedEvent.payload.toolCall.id).toBe("tc_failed");
    expect(failedEvent.payload.toolCall.name).toBe("dangerous_operation");
    expect(failedEvent.payload.error).toBe("Permission denied: cannot access /system");
    expect(failedEvent.payload.duration).toBe(45);
  });

  it("should record tool not found error", () => {
    const toolCall: ToolCall = {
      id: "tc_unknown",
      name: "unknown_tool",
      arguments: {},
    };

    const failedEvent = createToolCallFailedEvent(
      "sess_1",
      3,
      toolCall,
      "Tool not found: unknown_tool",
      0,
    );

    expect(failedEvent.payload.error).toBe("Tool not found: unknown_tool");
    expect(failedEvent.payload.duration).toBe(0);
  });

  it("should record tool execution timeout", () => {
    const toolCall: ToolCall = {
      id: "tc_slow",
      name: "slow_tool",
      arguments: { timeout: 5000 },
    };

    const failedEvent = createToolCallFailedEvent(
      "sess_1",
      7,
      toolCall,
      "Tool execution timed out after 30000ms",
      30000,
    );

    expect(failedEvent.payload.duration).toBe(30000);
    expect(failedEvent.payload.error).toContain("timed out");
  });

  it("should preserve failed event in store for replay", async () => {
    const store = new InMemoryEventStore();
    const session = new AgentSession("sess_1", "/test", {}, store);
    session.start();

    const toolCall: ToolCall = {
      id: "tc_1",
      name: "failing_tool",
      arguments: {},
    };

    session.appendEvent(createToolCallRequestedEvent("sess_1", 0, toolCall));
    session.appendEvent(createToolCallFailedEvent("sess_1", 0, toolCall, "Tool crashed", 100));

    // Verify failed event is in store
    const events = store.list("sess_1", { types: ["tool_call_failed"] });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_call_failed");

    await store.close();
  });
});
