// @altos/core - AgentSession

import type { AgentEvent, EventFilter } from "../events/types.js";
import { InMemoryEventStore, type EventStore } from "../store/index.js";

/**
 * Session status reflects the current state of the agent session.
 */
export type SessionStatus =
  | "created"
  | "running"
  | "waiting_for_permission"
  | "executing_tool"
  | "paused"
  | "completed"
  | "failed";

/**
 * Model configuration for the agent.
 */
export interface ModelConfig {
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AgentSession represents a single agent execution context.
 *
 * A session is:
 * - Isolated: Events from one session don't mix with another
 * - Ordered: Events have strict sequence numbers within a session
 * - Persistent: Events can be replayed at any time
 */
export class AgentSession {
  readonly id: string;
  readonly cwd: string;
  readonly createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  modelConfig: ModelConfig;
  private eventStore: EventStore;
  private sequence: number = 0;

  constructor(id: string, cwd: string, modelConfig: ModelConfig = {}, eventStore?: EventStore) {
    this.id = id;
    this.cwd = cwd;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.status = "created";
    this.modelConfig = modelConfig;
    this.eventStore = eventStore ?? new InMemoryEventStore();
  }

  /**
   * Append an event to the session's event log.
   */
  appendEvent(event: AgentEvent): AgentEvent {
    // Ensure event belongs to this session and has proper sequence
    const sessionEvent = {
      ...event,
      sessionId: this.id,
      sequence: ++this.sequence,
    };

    this.updatedAt = Date.now();
    return this.eventStore.append(sessionEvent);
  }

  /**
   * Get all events for this session, with optional filtering.
   */
  listEvents(filter?: EventFilter): AgentEvent[] {
    return this.eventStore.list(this.id, filter);
  }

  /**
   * Replace all events in the session with a new set.
   * Used after compaction to replace many events with a summary.
   */
  replaceEvents(events: AgentEvent[]): void {
    this.eventStore.clearSession(this.id);
    for (const event of events) {
      this.eventStore.append(event);
    }
  }

  /**
   * Replay all events for this session in order.
   */
  async *replayEvents(): AsyncGenerator<AgentEvent, void, unknown> {
    yield* this.eventStore.replay(this.id);
  }

  /**
   * Get event count for this session.
   */
  getEventCount(): number {
    return this.eventStore.getEventCount(this.id);
  }

  /**
   * Set session status.
   */
  setStatus(status: SessionStatus): void {
    this.status = status;
    this.updatedAt = Date.now();
  }

  /**
   * Mark session as started.
   */
  start(): void {
    this.setStatus("running");
  }

  /**
   * Mark session as completed.
   */
  complete(_reason?: string): void {
    this.setStatus("completed");
    this.updatedAt = Date.now();
  }

  /**
   * Mark session as failed.
   */
  fail(): void {
    this.setStatus("failed");
    this.updatedAt = Date.now();
  }

  /**
   * Mark session as waiting for permission.
   */
  waitForPermission(): void {
    this.setStatus("waiting_for_permission");
  }

  /**
   * Resume from waiting for permission.
   */
  resumeFromPermission(): void {
    this.setStatus("running");
  }

  /**
   * Mark session as executing tool.
   */
  executingTool(): void {
    this.setStatus("executing_tool");
  }

  /**
   * Get session summary.
   */
  toSummary(): SessionSummary {
    return {
      id: this.id,
      cwd: this.cwd,
      modelConfig: this.modelConfig,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      status: this.status,
      eventCount: this.getEventCount(),
    };
  }

  /**
   * Close the session and release resources.
   */
  async close(): Promise<void> {
    await this.eventStore.close();
  }
}

/**
 * Session summary for lightweight representation.
 */
export interface SessionSummary {
  id: string;
  cwd: string;
  modelConfig: ModelConfig;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  eventCount: number;
}
