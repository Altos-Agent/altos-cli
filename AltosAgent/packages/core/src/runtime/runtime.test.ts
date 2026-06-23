// @altos/core - Runtime tests

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AgentRuntime,
  type ToolDefinition,
  type AgentEvent,
  FakeModelAdapter,
  FakeResponses,
  createFakeAdapter,
} from "../index.js";
import type { ToolCall } from "../events/types.js";
import type { ToolResult } from "../runtime/runtime.js";

describe("@altos/core - AgentRuntime", () => {
  let runtime: AgentRuntime;
  let events: AgentEvent[];

  const createTestTool = (name: string, result: ToolResult): ToolDefinition => ({
    name,
    description: `Test tool: ${name}`,
    inputSchema: { type: "object" },
    handler: async () => result,
  });

  const collectEvents = (e: AgentEvent): void => {
    events.push(e);
  };

  beforeEach(() => {
    events = [];
    runtime = new AgentRuntime({
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
  });

  afterEach(async () => {
    await runtime.close();
  });

  describe("Session Management", () => {
    it("should start a new session", async () => {
      runtime.addEventListener(collectEvents);
      runtime.setModelAdapter(createFakeAdapter("greeting"));

      const session = await runtime.startSession({
        cwd: "/test/project",
        modelConfig: { model: "gpt-4" },
      });

      expect(session.id).toBeDefined();
      expect(session.cwd).toBe("/test/project");
      expect(session.status).toBe("running");
      expect(session.modelConfig.model).toBe("gpt-4");

      // Check session_started event was emitted
      const sessionEvent = events.find((e) => e.type === "session_started");
      expect(sessionEvent).toBeDefined();
      expect(sessionEvent!.sessionId).toBe(session.id);
    });

    it("should get session by ID", async () => {
      const session = await runtime.startSession();

      const found = runtime.getSession(session.id);
      expect(found).toBe(session);
    });

    it("should get active session", async () => {
      // Start two sessions with a small delay to ensure different timestamps
      await runtime.startSession({ id: "session_first" });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await runtime.startSession({ id: "session_second" });

      const active = runtime.getActiveSession();
      // The active session should be the most recently created
      expect(active?.id).toBe("session_second");
    });

    it("should complete a session", async () => {
      runtime.addEventListener(collectEvents);
      const session = await runtime.startSession();

      await runtime.completeSession(session.id, "User exited");

      const completedEvent = events.find((e) => e.type === "session_completed");
      expect(completedEvent).toBeDefined();
    });
  });

  describe("Event Emission", () => {
    it("should emit user message event", async () => {
      runtime.addEventListener(collectEvents);

      const session = await runtime.startSession();
      await runtime.appendUserMessage(session.id, "Hello, Altos!");

      const msgEvent = events.find((e) => e.type === "user_message");
      expect(msgEvent).toBeDefined();
      expect(msgEvent!.sessionId).toBe(session.id);
    });

    it("should emit events to all listeners", async () => {
      const events2: AgentEvent[] = [];
      runtime.addEventListener(collectEvents);
      runtime.addEventListener((e) => {
        events2.push(e);
      });

      const session = await runtime.startSession();

      const listener1Count = events.length;
      const listener2Count = events2.length;

      await runtime.appendUserMessage(session.id, "Test");

      expect(events.length).toBe(listener1Count + 1);
      expect(events2.length).toBe(listener2Count + 1);
    });

    it("should allow removing listeners", async () => {
      const listener = vi.fn((_e: AgentEvent) => {
        /* do nothing */
      });

      // First create a session to verify it was working
      const session = await runtime.startSession();

      // Now add listener - it should receive events from now on
      runtime.addEventListener(listener);

      // Add a message - listener SHOULD be called
      await runtime.appendUserMessage(session.id, "Test1");

      // Verify listener was called
      expect(listener).toHaveBeenCalled();

      // Remove listener
      runtime.removeEventListener(listener);

      // Add another message - listener should NOT be called
      await runtime.appendUserMessage(session.id, "Test2");

      // Listener should only have been called once (for Test1)
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tool Registration", () => {
    it("should register and retrieve tools", () => {
      const tool = createTestTool("test_tool", { success: true, duration: 10 });
      runtime.registerTool(tool);

      expect(runtime.getTool("test_tool")).toBe(tool);
    });

    it("should register multiple tools", () => {
      const tools = [
        createTestTool("tool1", { success: true, duration: 1 }),
        createTestTool("tool2", { success: true, duration: 1 }),
      ];
      runtime.registerTools(tools);

      expect(runtime.getTool("tool1")).toBeDefined();
      expect(runtime.getTool("tool2")).toBeDefined();
    });
  });

  describe("Tool Execution", () => {
    it("should execute a tool and emit completion event", async () => {
      runtime.addEventListener(collectEvents);
      const session = await runtime.startSession();

      runtime.registerTool(
        createTestTool("echo", {
          success: true,
          data: { echoed: "hello" },
          duration: 5,
        }),
      );

      const fakeAdapter = new FakeModelAdapter({
        responses: [FakeResponses.withToolCall("echo", { msg: "hello" })],
      });
      runtime.setModelAdapter(fakeAdapter);

      await runtime.appendUserMessage(session.id, "Echo my message");
      const result = await runtime.executeIteration(session.id);

      expect(result.events.some((e) => e.type === "tool_call_completed")).toBe(true);
    });

    it("should emit tool_call_failed when tool not found", async () => {
      runtime.addEventListener(collectEvents);
      const session = await runtime.startSession();

      const fakeAdapter = new FakeModelAdapter({
        responses: [FakeResponses.withToolCall("nonexistent_tool", {})],
      });
      runtime.setModelAdapter(fakeAdapter);

      await runtime.appendUserMessage(session.id, "Run nonexistent");
      await runtime.executeIteration(session.id);

      const failedEvent = events.find((e) => e.type === "tool_call_failed");
      expect(failedEvent).toBeDefined();
    });

    it("should record tool execution failure", async () => {
      // Create a fresh runtime for this test
      const toolRuntime = new AgentRuntime();

      // Set up local event collection
      const localEvents: AgentEvent[] = [];
      toolRuntime.addEventListener((e) => {
        localEvents.push(e);
      });

      const session = await toolRuntime.startSession();

      // Register a failing tool (returns success: false)
      toolRuntime.registerTool({
        name: "failing_tool",
        description: "A tool that fails",
        inputSchema: { type: "object" },
        handler: async () => ({
          success: false,
          error: "Internal error: unexpected failure",
          duration: 50,
        }),
      });

      const fakeAdapter = new FakeModelAdapter({
        responses: [FakeResponses.withToolCall("failing_tool", {})],
      });
      toolRuntime.setModelAdapter(fakeAdapter);

      await toolRuntime.appendUserMessage(session.id, "Run failing tool");
      await toolRuntime.executeIteration(session.id);

      // The tool completes with success: false - this emits tool_call_completed
      // with the failure result, not tool_call_failed
      const completedEvent = localEvents.find((e) => e.type === "tool_call_completed");
      expect(completedEvent).toBeDefined();
      expect(
        (completedEvent as { payload: { result: { success: boolean; error?: string } } }).payload
          .result.success,
      ).toBe(false);
      expect(
        (completedEvent as { payload: { result: { success: boolean; error?: string } } }).payload
          .result.error,
      ).toBe("Internal error: unexpected failure");

      await toolRuntime.close();
    });

    it("should emit tool_call_failed when tool throws exception", async () => {
      const toolRuntime = new AgentRuntime();

      const localEvents: AgentEvent[] = [];
      toolRuntime.addEventListener((e) => {
        localEvents.push(e);
      });

      const session = await toolRuntime.startSession();

      // Register a tool that throws
      toolRuntime.registerTool({
        name: "throwing_tool",
        description: "A tool that throws",
        inputSchema: { type: "object" },
        handler: async () => {
          throw new Error("Tool crashed unexpectedly");
        },
      });

      const fakeAdapter = new FakeModelAdapter({
        responses: [FakeResponses.withToolCall("throwing_tool", {})],
      });
      toolRuntime.setModelAdapter(fakeAdapter);

      await toolRuntime.appendUserMessage(session.id, "Run throwing tool");
      await toolRuntime.executeIteration(session.id);

      // When a tool throws, it emits tool_call_failed
      const failedEvent = localEvents.find((e) => e.type === "tool_call_failed");
      expect(failedEvent).toBeDefined();
      expect((failedEvent as { payload: { error: string } }).payload.error).toContain(
        "Tool crashed",
      );

      await toolRuntime.close();
    });
  });

  describe("Permission Handling", () => {
    it("should request permission before executing tool when handler is configured", async () => {
      // Create a fresh runtime with both permissionHandler AND autoPermission: false
      const permRuntime = new AgentRuntime({
        autoPermission: false,
        permissionHandler: async (_perm: string, _toolCall: ToolCall) => {
          // Always deny permission for testing
          return false;
        },
      });

      // Set up local event collection
      const localEvents: AgentEvent[] = [];
      permRuntime.addEventListener((e) => {
        localEvents.push(e);
      });

      permRuntime.registerTool(createTestTool("permission_tool", { success: true, duration: 1 }));

      const fakeAdapter = new FakeModelAdapter({
        responses: [FakeResponses.withToolCall("permission_tool", {})],
      });
      permRuntime.setModelAdapter(fakeAdapter);

      await permRuntime.startSession();
      const session = permRuntime.getActiveSession()!;
      await permRuntime.appendUserMessage(session.id, "Run sensitive tool");
      await permRuntime.executeIteration(session.id);

      // Check that permission_requested event was emitted
      const permRequestEvent = localEvents.find((e) => e.type === "permission_requested");
      expect(permRequestEvent).toBeDefined();

      // Check that permission_denied event was emitted (since we returned false)
      const permDeniedEvent = localEvents.find((e) => e.type === "permission_denied");
      expect(permDeniedEvent).toBeDefined();

      await permRuntime.close();
    });

    it("should auto-grant permissions when configured", async () => {
      const autoRuntime = new AgentRuntime({
        autoPermission: true,
        permissionHandler: () => Promise.resolve(false), // Should not be called
      });

      // Set up local event collection
      const localEvents: AgentEvent[] = [];
      autoRuntime.addEventListener((e) => {
        localEvents.push(e);
      });

      autoRuntime.registerTool(createTestTool("auto_tool", { success: true, duration: 1 }));

      const fakeAdapter = new FakeModelAdapter({
        responses: [FakeResponses.withToolCall("auto_tool", {})],
      });
      autoRuntime.setModelAdapter(fakeAdapter);

      const session = await autoRuntime.startSession();
      await autoRuntime.appendUserMessage(session.id, "Run auto tool");
      await autoRuntime.executeIteration(session.id);

      // Should have tool completed without permission_requested event
      const completedEvent = localEvents.find((e) => e.type === "tool_call_completed");
      expect(completedEvent).toBeDefined();

      // Should NOT have permission_requested event
      const permRequestEvent = localEvents.find((e) => e.type === "permission_requested");
      expect(permRequestEvent).toBeUndefined();

      await autoRuntime.close();
    });
  });

  describe("Agent Loop Iteration", () => {
    it("should complete iteration and return done status", async () => {
      const session = await runtime.startSession();
      runtime.setModelAdapter(createFakeAdapter("greeting"));

      await runtime.appendUserMessage(session.id, "Hello");
      const result = await runtime.executeIteration(session.id);

      expect(result.done).toBe(true);
      expect(result.events.length).toBeGreaterThan(0);
    });

    it("should continue iteration when tool calls are made", async () => {
      const session = await runtime.startSession();

      runtime.registerTool(
        createTestTool("search", { success: true, data: ["result"], duration: 1 }),
      );

      const fakeAdapter = new FakeModelAdapter({
        responses: [
          FakeResponses.withToolCall("search", { query: "test" }),
          FakeResponses.greeting(),
        ],
      });
      runtime.setModelAdapter(fakeAdapter);

      await runtime.appendUserMessage(session.id, "Search for something");

      const result = await runtime.executeIteration(session.id);
      expect(result.events.some((e) => e.type === "tool_call_completed")).toBe(true);
    });

    it("should call streaming callback during iteration", async () => {
      const session = await runtime.startSession();
      const streamedChars: string[] = [];

      runtime.setModelAdapter(
        new FakeModelAdapter({
          responses: [{ content: "Hello!", finishReason: "stop" }],
        }),
      );

      await runtime.appendUserMessage(session.id, "Hi");
      await runtime.executeIteration(session.id, (delta: string, isComplete: boolean) => {
        if (delta) streamedChars.push(delta);
        if (isComplete) streamedChars.push("[DONE]");
      });

      expect(streamedChars.join("")).toBe("Hello![DONE]");
    });
  });

  describe("Session Replay", () => {
    it("should replay session events", async () => {
      const session = await runtime.startSession();
      runtime.setModelAdapter(createFakeAdapter("multi_turn"));

      await runtime.appendUserMessage(session.id, "First");
      await runtime.appendUserMessage(session.id, "Second");

      const replayed: AgentEvent[] = [];
      for await (const event of runtime.replaySession(session.id)) {
        replayed.push(event);
      }

      expect(replayed.length).toBeGreaterThanOrEqual(2);
      const userMessages = replayed.filter((e) => e.type === "user_message");
      expect(userMessages).toHaveLength(2);
    });
  });
});

describe("@altos/core - FakeModelAdapter", () => {
  it("should return configured responses in order", async () => {
    const adapter = new FakeModelAdapter({
      responses: [
        { content: "First response", finishReason: "stop" },
        { content: "Second response", finishReason: "stop" },
      ],
    });

    const res1 = await adapter.call([], {});
    const res2 = await adapter.call([], {});
    const res3 = await adapter.call([], {});

    expect(res1.content).toBe("First response");
    expect(res2.content).toBe("Second response");
    expect(res3.content).toBe("First response");
  });

  it("should stream responses character by character", async () => {
    const adapter = new FakeModelAdapter({
      responses: [{ content: "Hi", finishReason: "stop" }],
    });

    const chars: string[] = [];
    for await (const char of adapter.stream([], {})) {
      chars.push(char);
    }

    expect(chars).toEqual(["H", "i"]);
  });

  it("should apply delay when configured", async () => {
    const adapter = new FakeModelAdapter({
      responses: [FakeResponses.greeting()],
      delay: 50,
    });

    const start = Date.now();
    await adapter.call([], {});
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(45);
  });

  it("should reset state", () => {
    const adapter = new FakeModelAdapter({
      responses: [FakeResponses.greeting(), FakeResponses.error("Error")],
    });

    adapter.call([], {});
    adapter.call([], {});
    adapter.call([], {});

    adapter.reset();
  });

  it("should add responses dynamically", () => {
    const adapter = new FakeModelAdapter();
    adapter.addResponse(FakeResponses.greeting());
    adapter.addResponse(FakeResponses.withToolCall("test", {}));

    expect(adapter).toBeDefined();
  });
});

describe("@altos/core - FakeResponses helpers", () => {
  it("should create greeting response", () => {
    const response = FakeResponses.greeting();
    expect(response.content).toContain("Altos");
    expect(response.finishReason).toBe("stop");
  });

  it("should create tool call response", () => {
    const response = FakeResponses.withToolCall("read_file", { path: "/test" });
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0].name).toBe("read_file");
    expect(response.toolCalls![0].arguments.path).toBe("/test");
  });

  it("should create multi-tool response", () => {
    const response = FakeResponses.withMultipleToolCalls([
      { name: "tool1", args: {} },
      { name: "tool2", args: { key: "value" } },
    ]);
    expect(response.toolCalls).toHaveLength(2);
  });

  it("should create error response", () => {
    const response = FakeResponses.error("Something went wrong");
    expect(response.content).toContain("error");
    expect(response.finishReason).toBe("stop");
  });
});
