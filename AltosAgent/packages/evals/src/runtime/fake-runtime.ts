/**
 * Fake runtime provider for eval tests.
 *
 * No real AI API calls. Produces deterministic event sequences that exercise
 * all eval infrastructure code paths: session recording, replay, scoring,
 * permission denial, dangerous command refusal, and auto-compaction.
 */

import { randomUUID } from "crypto";
import type {
  AgentEvent,
  ToolDefinition,
  ToolResult,
} from "@altos/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FakeRuntimeConfig {
  /** Fixed session ID returned by startSession (default: random UUID). */
  sessionId?: string;
  /** Steps this runtime executes before signaling done. Default: 2. */
  stepCount?: number;
  /** If true, each executeIteration emits a permission_requested + permission_decision event. */
  emitPermissionRequest?: boolean;
  /** If true, the first tool call fails with a "dangerous" error. */
  emitDangerousRefusal?: boolean;
  /** If set, emit this many token usage events per iteration. */
  emitTokenUsage?: { input: number; output: number };
  /** If set, emit a compaction event when step >= compactionStep. */
  emitAutoCompact?: { compactionStep: number };
  /** Map of toolName -> FakeToolBehavior. Default: all tools succeed. */
  toolBehaviors?: Record<string, FakeToolBehavior>;
}

export interface FakeToolBehavior {
  response?: unknown;
  error?: string;
  delayMs?: number;
}

export interface ExecutionStep {
  /** Events to emit during this step. */
  events: AgentEvent[];
  /** If true, this is the last step (done = true). */
  done: boolean;
}

// ---------------------------------------------------------------------------
// FakeAgentSession
// ---------------------------------------------------------------------------

interface FakeAgentSession {
  id: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  done: boolean;
}

// ---------------------------------------------------------------------------
// FakeAgentRuntime
// ---------------------------------------------------------------------------

/**
 * Minimal fake AgentRuntime that emits deterministic events for eval testing.
 */
export class FakeAgentRuntime {
  private sessionId: string;
  private session: FakeAgentSession;
  private tools = new Map<string, ToolDefinition>();
  private stepCount: number;
  private currentStep = 0;
  private emitPermissionRequest: boolean;
  private emitDangerousRefusal: boolean;
  private emitTokenUsage?: { input: number; output: number };
  private emitAutoCompact?: { compactionStep: number };
  private toolBehaviors: Record<string, FakeToolBehavior>;
  private listeners = new Set<(event: AgentEvent) => void>();

  constructor(config: FakeRuntimeConfig = {}) {
    this.sessionId = config.sessionId ?? randomUUID();
    this.stepCount = config.stepCount ?? 2;
    this.emitPermissionRequest = config.emitPermissionRequest ?? false;
    this.emitDangerousRefusal = config.emitDangerousRefusal ?? false;
    this.emitTokenUsage = config.emitTokenUsage;
    this.emitAutoCompact = config.emitAutoCompact;
    this.toolBehaviors = config.toolBehaviors ?? {};
    this.session = {
      id: this.sessionId,
      messages: [],
      done: false,
    };
  }

  // -------------------------------------------------------------------------
  // Tool management
  // -------------------------------------------------------------------------

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  async startSession(): Promise<FakeAgentSession> {
    return { ...this.session };
  }

  getSession(_id: string): FakeAgentSession | undefined {
    return this.session;
  }

  getActiveSession(): FakeAgentSession | undefined {
    return this.session;
  }

  async appendUserMessage(_sessionId: string, content: string): Promise<FakeAgentSession> {
    this.session.messages.push({ role: "user", content });
    return { ...this.session };
  }

  // -------------------------------------------------------------------------
  // Event listeners
  // -------------------------------------------------------------------------

  addEventListener(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  removeEventListener(listener: (event: AgentEvent) => void): void {
    this.listeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // -------------------------------------------------------------------------
  // Agent loop
  // -------------------------------------------------------------------------

  async executeIteration(_sessionId: string): Promise<{ done: boolean; events: AgentEvent[] }> {
    const events: AgentEvent[] = [];

    if (this.emitTokenUsage) {
      events.push({
        type: "token_usage",
        input: this.emitTokenUsage.input,
        output: this.emitTokenUsage.output,
      } as unknown as AgentEvent);
    }

    // Auto-compaction emission
    if (this.emitAutoCompact && this.currentStep === this.emitAutoCompact.compactionStep) {
      events.push({ type: "session_compacted", sessionId: this.sessionId } as unknown as AgentEvent);
    }

    // Permission request
    if (this.emitPermissionRequest && this.currentStep === 0) {
      events.push(
        {
          type: "permission_requested",
          toolName: "Bash",
          riskLevel: "high",
          reason: "Executing a shell command",
        } as unknown as AgentEvent,
      );
      events.push(
        {
          type: "permission_decision",
          toolName: "Bash",
          riskLevel: "high",
          granted: false,
          reason: "denied",
        } as unknown as AgentEvent,
      );
    }

    // Assistant message with a tool call
    const toolCallName = this.currentStep === 0 ? "Read" : "Bash";
    const toolCallId = `call_${this.currentStep}_${randomUUID().slice(0, 8)}`;

    events.push({
      type: "assistant_message",
      content: `I will use the ${toolCallName} tool.`,
    } as unknown as AgentEvent);

    events.push({
      type: "tool_call_requested",
      toolName: toolCallName,
      toolCall: {
        id: toolCallId,
        name: toolCallName,
        input: toolCallName === "Read" ? { filePath: "src/index.ts" } : { command: "echo hello" },
      },
    } as unknown as AgentEvent);

    // Tool call result or refusal
    const behavior = this.toolBehaviors[toolCallName];
    if (this.emitDangerousRefusal && this.currentStep === 0) {
      events.push({
        type: "tool_call_failed",
        toolName: toolCallName,
        toolCall: { id: toolCallId, name: toolCallName, input: {} },
        error: "Refusing to execute dangerous command",
      } as unknown as AgentEvent);
    } else if (behavior?.error) {
      events.push({
        type: "tool_call_failed",
        toolName: toolCallName,
        toolCall: { id: toolCallId, name: toolCallName, input: {} },
        error: behavior.error,
      } as unknown as AgentEvent);
    } else {
      events.push({
        type: "tool_call_completed",
        toolName: toolCallName,
        toolCall: { id: toolCallId, name: toolCallName, input: {} },
        result: {
          success: true,
          data: behavior?.response ?? { success: true, mocked: true },
          duration: behavior?.delayMs ?? 0,
        } as unknown as ToolResult,
      } as unknown as AgentEvent);
    }

    this.currentStep++;

    const done = this.currentStep >= this.stepCount;
    if (done) {
      this.session.done = true;
      events.push({
        type: "assistant_message",
        content: "All tasks completed.",
      } as unknown as AgentEvent);
    }

    for (const event of events) {
      this.emit(event);
    }

    return { done, events };
  }

  async compactSession(_sessionId: string): Promise<boolean> {
    this.emit({ type: "session_compacted", sessionId: this.sessionId } as unknown as AgentEvent);
    return true;
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    this.listeners.clear();
  }
}

// ---------------------------------------------------------------------------
// FakeRuntimeFactory
// ---------------------------------------------------------------------------

export interface FakeRuntimeFactoryConfig {
  /** Passed to each created FakeAgentRuntime. */
  runtimeConfig?: FakeRuntimeConfig;
  /** Steps to run before done. Default: 2. */
  stepCount?: number;
}

/**
 * Creates FakeAgentRuntime instances for eval tests.
 * No real AI API calls are made.
 */
export function createFakeRuntimeFactory(
  config: FakeRuntimeFactoryConfig = {},
): {
  create: (
    caseId: string,
    fixtureRepo?: string,
    mocks?: Array<{ toolName: string; response?: unknown; error?: string; delayMs?: number }>,
  ) => Promise<{
    runtime: FakeAgentRuntime;
    sessionId: string;
    cwd: string;
    tempDir?: string;
  }>;
  teardown: (ctx: { runtime: FakeAgentRuntime; tempDir?: string }) => Promise<void>;
} {
  return {
    async create(caseId, _fixtureRepo, mocks = []) {
      const runtimeConfig: FakeRuntimeConfig = {
        ...config.runtimeConfig,
        sessionId: `fake-session-${caseId}`,
        stepCount: config.stepCount ?? 2,
      };

      // Apply mocks to toolBehaviors
      if (mocks.length > 0) {
        runtimeConfig.toolBehaviors = { ...runtimeConfig.toolBehaviors };
        for (const mock of mocks) {
          runtimeConfig.toolBehaviors![mock.toolName] = {
            response: mock.response,
            error: mock.error,
            delayMs: mock.delayMs,
          };
        }
      }

      const runtime = new FakeAgentRuntime(runtimeConfig);
      const session = await runtime.startSession();

      return {
        runtime,
        sessionId: session.id,
        cwd: "/fake/cwd",
        tempDir: undefined,
      };
    },

    async teardown(ctx) {
      await ctx.runtime.close();
    },
  };
}
