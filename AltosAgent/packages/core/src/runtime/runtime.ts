// @altos/core - AgentRuntime

import { AgentSession, type ModelConfig } from "../session/session.js";
import type { AgentEvent, ToolCall } from "../events/types.js";
import {
  createSessionStartedEvent,
  createUserMessageEvent,
  createAssistantMessageEvent,
  createToolCallRequestedEvent,
  createToolCallStartedEvent,
  createToolCallCompletedEvent,
  createToolCallFailedEvent,
  createPermissionRequestedEvent,
  createPermissionGrantedEvent,
  createPermissionDeniedEvent,
  createSessionCompletedEvent,
  createCompactRequestedEvent,
  createCompactCompletedEvent,
  createCompactFailedEvent,
  createErrorEvent,
} from "../events/factory.js";
import { InMemoryEventStore, type EventStore } from "../store/index.js";
import type { Logger } from "../index.js";
import {
  ContextBudgetManager,
  AutoCompactor,
  partitionEvents,
  type BudgetStatus,
  type BudgetThresholds,
} from "../context/index.js";

// =============================================================================
// Hook Emitter interface (implemented by @altos/plugins)
// =============================================================================

/**
 * Interface for the plugin hook emitter.
 * The runtime holds a reference to the HookEmitter from @altos/plugins.
 * This avoids a direct package dependency on @altos/plugins from @altos/core.
 */
export interface HookEmitter {
  emit(
    event: string,
    ctx: {
      event: string;
      sessionId?: string;
      data?: unknown;
      timestamp: number;
      stopPropagation?: boolean;
      result?: unknown;
    },
    logger?: Logger,
  ): Promise<void>;
}

/**
 * Tool definition for the runtime
 */
export interface ToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext,
) => Promise<ToolResult>;

/**
 * Context passed to tool handlers
 */
export interface ToolContext {
  sessionId: string;
  cwd: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

/**
 * Permission handler - asks user for permission to execute a tool
 */
export type PermissionHandler = (
  permission: string,
  toolCall: ToolCall,
  reason?: string,
) => Promise<boolean>;

/**
 * Event listener callback
 */
export type EventListener = (event: AgentEvent) => void | Promise<void>;

/**
 * Streaming callback for delta events
 */
export type StreamingCallback = (delta: string, isComplete: boolean) => void | Promise<void>;

/**
 * Minimal interface for session summarization capability.
 * Used by the runtime to write session compaction summaries to memory.
 */
export interface SessionSummarizer {
  summarizeSession(sessionId: string, events: AgentEvent[]): Promise<{
    sessionId: string;
    startTime: number;
    endTime?: number;
    eventCount: number;
    summary: string;
    decisions: string[];
    fileChanges: string[];
    testResults?: string[];
  }>;
}

/**
 * Runtime configuration
 */
export interface RuntimeConfig {
  cwd?: string;
  modelConfig?: ModelConfig;
  eventStore?: EventStore;
  logger?: Logger;
  permissionHandler?: PermissionHandler;
  autoPermission?: boolean; // Auto-grant permissions for testing
  /** Hook emitter for plugin lifecycle events */
  hookEmitter?: HookEmitter;
  /** Memory provider for session summaries (optional) */
  memoryProvider?: SessionSummarizer;
}

/**
 * Model adapter interface
 */
export interface ModelAdapter {
  call(
    messages: Array<{ role: string; content: string }>,
    config: ModelConfig,
  ): Promise<{
    content: string;
    toolCalls?: ToolCall[];
    finishReason: string;
  }>;
  stream?(
    messages: Array<{ role: string; content: string }>,
    config: ModelConfig,
  ): AsyncGenerator<
    string,
    {
      content: string;
      toolCalls?: ToolCall[];
      finishReason: string;
    },
    unknown
  >;
}

/**
 * AgentRuntime is the core execution engine for Altos.
 *
 * It orchestrates:
 * - Session management
 * - Event emission and storage
 * - Tool registration and execution
 * - Model interaction
 * - Permission handling
 *
 * The runtime is:
 * - Event-driven: All state changes emit events
 * - Replayable: Sessions can be replayed from event history
 * - Observable: External listeners can subscribe to events
 * - Embeddable: Can be used as a library without the CLI
 */
export class AgentRuntime {
  private sessions: Map<string, AgentSession> = new Map();
  private tools: Map<string, ToolDefinition> = new Map();
  private listeners: Set<EventListener> = new Set();
  private modelAdapter: ModelAdapter | null = null;
  private config: RuntimeConfig;
  private eventStore: EventStore;
  private eventCounter = 0;
  private hookEmitter?: HookEmitter;
  private budgetManager: ContextBudgetManager;
  private autoCompactor: AutoCompactor;
  private memoryProvider?: SessionSummarizer;

  constructor(config: RuntimeConfig = {}, maxContextTokens = 100_000) {
    this.config = {
      cwd: config.cwd ?? process.cwd(),
      modelConfig: config.modelConfig ?? {},
      logger: config.logger,
      permissionHandler: config.permissionHandler,
      autoPermission: config.autoPermission ?? false,
    };
    this.eventStore = config.eventStore ?? new InMemoryEventStore();
    this.hookEmitter = config.hookEmitter;
    this.memoryProvider = config.memoryProvider;
    this.budgetManager = new ContextBudgetManager(maxContextTokens);
    this.autoCompactor = new AutoCompactor();
  }

  /**
   * Create a new agent session
   */
  async startSession(options?: {
    id?: string;
    cwd?: string;
    modelConfig?: ModelConfig;
  }): Promise<AgentSession> {
    const sessionId = options?.id ?? this.generateSessionId();
    const cwd = options?.cwd ?? this.config.cwd!;
    const modelConfig = options?.modelConfig ?? this.config.modelConfig!;

    const session = new AgentSession(sessionId, cwd, modelConfig, this.eventStore);
    this.sessions.set(sessionId, session);

    // Emit session_started event
    const event = createSessionStartedEvent(sessionId, ++this.eventCounter, {
      model: modelConfig.model,
      provider: modelConfig.provider,
      cwd,
    });
    session.appendEvent(event);
    this.emit(event);

    // Emit plugin hook: session_start
    await this.emitHook(
      "session_start",
      {
        sessionId,
        cwd,
        model: modelConfig.model,
        provider: modelConfig.provider,
      },
      sessionId,
    );

    session.start();
    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get the active session (most recently created)
   */
  getActiveSession(): AgentSession | undefined {
    let latest: AgentSession | undefined;
    let latestTime = 0;
    for (const session of this.sessions.values()) {
      if (
        session.createdAt > latestTime &&
        session.status !== "completed" &&
        session.status !== "failed"
      ) {
        latest = session;
        latestTime = session.createdAt;
      }
    }
    return latest;
  }

  /**
   * Register a tool with the runtime
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.config.logger?.debug(`Tool registered: ${tool.name}`);
  }

  /**
   * Register multiple tools at once
   */
  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Get a registered tool
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Set the model adapter
   */
  setModelAdapter(adapter: ModelAdapter): void {
    this.modelAdapter = adapter;
  }

  /**
   * Set the hook emitter for plugin lifecycle events.
   * This is typically called by the CLI after initializing the plugin manager.
   */
  setHookEmitter(emitter: HookEmitter): void {
    this.hookEmitter = emitter;
  }

  // ---------------------------------------------------------------------------
  // Context Budget Management
  // ---------------------------------------------------------------------------

  /**
   * Get the current context budget status for a session.
   */
  getBudgetStatus(sessionId: string): BudgetStatus {
    const session = this.sessions.get(sessionId);
    if (!session) return { level: "ok", usageRatio: 0 };
    const events = session.listEvents();
    this.budgetManager.updateFromEvents(events);
    return this.budgetManager.getStatus();
  }

  /**
   * Check if a model call can proceed given current budget.
   */
  canCallModel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.budgetManager.updateFromEvents(session.listEvents());
    }
    return this.budgetManager.canCallModel();
  }

  /**
   * Update budget thresholds.
   */
  setBudgetThresholds(thresholds: Partial<BudgetThresholds>): void {
    this.budgetManager.setThresholds(thresholds);
  }

  /**
   * Manually trigger compaction for a session.
   * Returns true if compaction was performed.
   */
  async compactSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const events = session.listEvents();
    if (events.length < 10) return false; // Don't compact tiny sessions

    const startTime = Date.now();
    const originalCount = events.length;

    // Emit compact_requested
    const requestedEvent = createCompactRequestedEvent(
      sessionId,
      ++this.eventCounter,
      "Manual compaction requested",
      originalCount,
    );
    session.appendEvent(requestedEvent);
    this.emit(requestedEvent);

    try {
      const { keep, compact } = partitionEvents(events);

      if (compact.length === 0) {
        // Nothing to compact
        const completedEvent = createCompactCompletedEvent(
          sessionId,
          ++this.eventCounter,
          originalCount,
          originalCount,
          Date.now() - startTime,
        );
        session.appendEvent(completedEvent);
        this.emit(completedEvent);
        return false;
      }

      // Compact the compactible events
      const firstCompactSeq = compact[0].sequence;
      const lastCompactSeq = compact[compact.length - 1].sequence;
      const summarizedEvent = await this.autoCompactor.compact(
        compact,
        sessionId,
        firstCompactSeq,
        lastCompactSeq,
      );

      // Build new event list: keep verbatim + summary + any events after compact range
      const afterCompact = events.filter((e) => e.sequence > lastCompactSeq);
      const newEvents: AgentEvent[] = [...keep, summarizedEvent as unknown as AgentEvent, ...afterCompact];

      // Replace session events with the new list
      // We do this by clearing and re-adding (the store interface doesn't have replace,
      // but session maintains its own event list)
      session.replaceEvents(newEvents);

      // Also update the event store
      this.eventStore.clearSession(sessionId);
      for (const e of newEvents) {
        this.eventStore.append(e);
      }

      const duration = Date.now() - startTime;
      const completedEvent = createCompactCompletedEvent(
        sessionId,
        ++this.eventCounter,
        originalCount,
        newEvents.length,
        duration,
      );
      session.appendEvent(completedEvent);
      this.emit(completedEvent);

      this.budgetManager.unblockCompaction();
      this.config.logger?.info(
        `Compacted session ${sessionId}: ${originalCount} events → ${newEvents.length} events`,
      );

      // Optionally write summary to memory provider (after redaction)
      if (this.memoryProvider) {
        try {
          await this.memoryProvider.summarizeSession(sessionId, newEvents);
        } catch (memErr) {
          this.config.logger?.warn("Failed to write compaction summary to memory:", memErr);
        }
      }

      return true;
    } catch (err) {
      const failedEvent = createCompactFailedEvent(
        sessionId,
        ++this.eventCounter,
        err instanceof Error ? err.message : String(err),
        originalCount,
      );
      session.appendEvent(failedEvent);
      this.emit(failedEvent);
      this.config.logger?.error(`Compaction failed for session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Emit file-write plugin hooks.
   * Called by file-system tools before and after writing.
   */
  async emitFileWriteHooks(
    sessionId: string,
    phase: "before" | "after",
    data: { filePath: string; content?: string; bytesWritten?: number },
  ): Promise<void> {
    const hookEvent = phase === "before" ? "before_file_write" : "after_file_write";
    await this.emitHook(hookEvent, { sessionId, ...data }, sessionId);
  }

  /**
   * Emit a plugin hook event through the hook emitter if configured.
   */
  private async emitHook(
    hookEvent: string,
    data: Record<string, unknown>,
    sessionId?: string,
  ): Promise<void> {
    if (!this.hookEmitter) return;
    try {
      await this.hookEmitter.emit(
        hookEvent,
        {
          event: hookEvent,
          sessionId,
          data,
          timestamp: Date.now(),
        },
        this.config.logger,
      );
    } catch (err) {
      this.config.logger?.error(`Hook emitter error for "${hookEvent}":`, err);
    }
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove an event listener
   */
  removeEventListener(listener: EventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            this.config.logger?.error("Event listener error:", err);
          });
        }
      } catch (err) {
        this.config.logger?.error("Event listener error:", err);
      }
    }
  }

  /**
   * Append a user message to the session
   */
  async appendUserMessage(sessionId: string, content: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const event = createUserMessageEvent(sessionId, ++this.eventCounter, content);
    session.appendEvent(event);
    this.emit(event);

    // Emit plugin hook: user_prompt
    await this.emitHook(
      "user_prompt",
      {
        sessionId,
        prompt: content,
      },
      sessionId,
    );

    return session;
  }

  /**
   * Execute one iteration of the agent loop
   */
  async executeIteration(
    sessionId: string,
    streamingCallback?: StreamingCallback,
  ): Promise<{ done: boolean; events: AgentEvent[] }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (!this.modelAdapter) {
      throw new Error("No model adapter configured");
    }

    // Update and check context budget
    this.budgetManager.updateFromEvents(session.listEvents());
    const budgetStatus = this.budgetManager.getStatus();

    // Handle blocked state - compaction required
    if (budgetStatus.level === "blocked") {
      this.config.logger?.warn(`Context budget blocked: ${budgetStatus.message}`);
      const compacted = await this.compactSession(sessionId);
      if (!compacted) {
        // Compaction failed or nothing to compact - must refuse the call
        return {
          done: true,
          events: [],
        };
      }
      // Compaction succeeded - retry budget check
      this.budgetManager.updateFromEvents(session.listEvents());
    }

    // Handle hard_compact - auto-compact before proceeding
    if (budgetStatus.level === "hard_compact") {
      this.config.logger?.warn(`Context budget hard compact: ${budgetStatus.message}`);
      await this.compactSession(sessionId);
    }

    const messages = this.buildMessages(session);

    const events: AgentEvent[] = [];

    try {
      await this.emitHook(
        "before_model_call",
        {
          sessionId,
          messages,
          modelConfig: session.modelConfig,
        },
        sessionId,
      );

      // Call the model
      const callStart = Date.now();
      const response = await this.modelAdapter.call(messages, session.modelConfig);
      const callDuration = Date.now() - callStart;

      // Emit plugin hook: after_model_call
      await this.emitHook(
        "after_model_call",
        {
          sessionId,
          response: {
            content: response.content,
            toolCalls: response.toolCalls,
            finishReason: response.finishReason,
          },
          duration: callDuration,
        },
        sessionId,
      );

      // Emit assistant message event
      const assistantEvent = createAssistantMessageEvent(
        sessionId,
        ++this.eventCounter,
        response.content,
        response.toolCalls,
      );
      session.appendEvent(assistantEvent);
      this.emit(assistantEvent);
      events.push(assistantEvent);

      // Stream delta if callback provided
      if (streamingCallback) {
        for (const char of response.content) {
          streamingCallback(char, false);
        }
        streamingCallback("", true);
      }

      // Handle tool calls if any
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const toolEvent = await this.executeTool(session, toolCall);
          if (toolEvent) {
            events.push(toolEvent);
          }
        }
      }

      return { done: response.finishReason === "stop", events };
    } catch (error) {
      const errorEvent = createErrorEvent(
        sessionId,
        ++this.eventCounter,
        "EXECUTION_ERROR",
        error instanceof Error ? error.message : String(error),
        true,
      );
      session.appendEvent(errorEvent);
      this.emit(errorEvent);
      events.push(errorEvent);

      return { done: true, events };
    }
  }

  /**
   * Execute a tool call with permission handling
   */
  async executeTool(session: AgentSession, toolCall: ToolCall): Promise<AgentEvent | null> {
    const sessionId = session.id;

    // Emit tool_call_requested event
    const requestedEvent = createToolCallRequestedEvent(sessionId, ++this.eventCounter, toolCall);
    session.appendEvent(requestedEvent);
    this.emit(requestedEvent);

    // Check if tool exists
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      const failedEvent = createToolCallFailedEvent(
        sessionId,
        ++this.eventCounter,
        toolCall,
        `Tool not found: ${toolCall.name}`,
        0,
      );
      session.appendEvent(failedEvent);
      this.emit(failedEvent);
      return failedEvent;
    }

    // Request permission if handler is configured
    if (this.config.permissionHandler && !this.config.autoPermission) {
      session.waitForPermission();

      const permissionEvent = createPermissionRequestedEvent(
        sessionId,
        ++this.eventCounter,
        toolCall.name,
        toolCall.id,
        tool.description,
      );
      session.appendEvent(permissionEvent);
      this.emit(permissionEvent);

      const granted = await this.config.permissionHandler(
        toolCall.name,
        toolCall,
        tool.description,
      );

      if (granted) {
        const grantedEvent = createPermissionGrantedEvent(
          sessionId,
          ++this.eventCounter,
          toolCall.name,
          toolCall.id,
        );
        session.appendEvent(grantedEvent);
        this.emit(grantedEvent);
      } else {
        const deniedEvent = createPermissionDeniedEvent(
          sessionId,
          ++this.eventCounter,
          toolCall.name,
          toolCall.id,
          "Permission denied by user",
        );
        session.appendEvent(deniedEvent);
        this.emit(deniedEvent);
        session.resumeFromPermission();
        return deniedEvent;
      }

      session.resumeFromPermission();
    }

    // Emit plugin hook: before_tool_call
    await this.emitHook(
      "before_tool_call",
      {
        sessionId,
        toolName: toolCall.name,
        arguments: toolCall.arguments,
      },
      sessionId,
    );

    // Execute the tool
    session.executingTool();
    const startTime = Date.now();

    const startedEvent = createToolCallStartedEvent(sessionId, ++this.eventCounter, toolCall);
    session.appendEvent(startedEvent);
    this.emit(startedEvent);

    try {
      const result = await tool.handler(toolCall.arguments, {
        sessionId,
        cwd: session.cwd,
      });

      // Emit plugin hook: after_tool_call
      await this.emitHook(
        "after_tool_call",
        {
          sessionId,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          result,
        },
        sessionId,
      );

      const completedEvent = createToolCallCompletedEvent(
        sessionId,
        ++this.eventCounter,
        toolCall,
        result,
      );
      session.appendEvent(completedEvent);
      this.emit(completedEvent);

      session.setStatus("running");
      return completedEvent;
    } catch (error) {
      const failedEvent = createToolCallFailedEvent(
        sessionId,
        ++this.eventCounter,
        toolCall,
        error instanceof Error ? error.message : String(error),
        Date.now() - startTime,
      );
      session.appendEvent(failedEvent);
      this.emit(failedEvent);

      session.setStatus("running");
      return failedEvent;
    }
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string, reason?: string): Promise<AgentSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const duration = Date.now() - session.createdAt;
    const eventCount = session.getEventCount();

    // Emit plugin hook: before_compact
    await this.emitHook(
      "before_compact",
      {
        sessionId,
        eventCount,
      },
      sessionId,
    );

    const event = createSessionCompletedEvent(
      sessionId,
      ++this.eventCounter,
      reason,
      eventCount,
      duration,
    );
    session.appendEvent(event);
    this.emit(event);

    // Emit plugin hook: session_end
    await this.emitHook(
      "session_end",
      {
        sessionId,
        reason,
        totalEvents: eventCount,
        duration,
      },
      sessionId,
    );

    session.complete(reason);
    return session;
  }

  /**
   * Build messages from session history for model context
   */
  private buildMessages(session: AgentSession): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];

    for (const event of session.listEvents()) {
      if (event.type === "user_message") {
        messages.push({ role: "user", content: event.payload.content });
      } else if (event.type === "assistant_message") {
        messages.push({ role: "assistant", content: event.payload.content });
      } else if (event.type === "tool_call_completed") {
        const toolResult = event.payload.result;
        messages.push({
          role: "tool",
          content: toolResult.success
            ? JSON.stringify(toolResult.data)
            : `Error: ${toolResult.error}`,
        });
      }
    }

    return messages;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Replay a session from its event history
   */
  async *replaySession(sessionId: string): AsyncGenerator<AgentEvent, void, unknown> {
    yield* this.eventStore.replay(sessionId);
  }

  /**
   * Close the runtime and clean up resources
   */
  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.close();
    }
    this.sessions.clear();
    await this.eventStore.close();
  }
}
