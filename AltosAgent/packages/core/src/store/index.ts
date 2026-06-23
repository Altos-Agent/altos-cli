// @altos/core - EventStore interface

import type { AgentEvent, EventFilter } from "../events/types.js";

/**
 * EventStore is an append-only, replayable event store.
 *
 * The store must maintain:
 * - Append-only semantics (events are never modified or deleted)
 * - Sequence ordering within a session
 * - Session isolation (events from different sessions are separate)
 */
export interface EventStore {
  /**
   * Append an event to the store.
   * Returns the appended event with any store-generated fields.
   */
  append(event: AgentEvent): AgentEvent;

  /**
   * List events for a session, with optional filtering.
   */
  list(sessionId: string, filter?: EventFilter): AgentEvent[];

  /**
   * Replay all events for a session in order.
   * Returns an async iterator for memory-efficient replay of large sessions.
   */
  replay(sessionId: string): AsyncGenerator<AgentEvent, void, unknown>;

  /**
   * Get the current event count for a session.
   */
  getEventCount(sessionId: string): number;

  /**
   * Get the latest sequence number for a session.
   * Returns 0 if no events exist.
   */
  getLatestSequence(sessionId: string): number;

  /**
   * Clear all events for a session (used for testing or session reset).
   */
  clearSession(sessionId: string): void;

  /**
   * Close the store and release resources.
   */
  close(): Promise<void>;
}

/**
 * In-memory implementation of EventStore for testing and ephemeral use.
 */
export class InMemoryEventStore implements EventStore {
  private events: AgentEvent[] = [];
  private sessionSequences: Map<string, number> = new Map();

  append(event: AgentEvent): AgentEvent {
    // Ensure sequence is set
    const currentSeq = this.sessionSequences.get(event.sessionId) ?? 0;
    const newSeq = event.sequence === 0 ? currentSeq + 1 : event.sequence;

    const storedEvent = { ...event, sequence: newSeq };
    this.events.push(storedEvent);
    this.sessionSequences.set(event.sessionId, newSeq);

    return storedEvent;
  }

  list(sessionId: string, filter?: EventFilter): AgentEvent[] {
    let results = this.events.filter((e) => e.sessionId === sessionId);

    if (filter?.types && filter.types.length > 0) {
      results = results.filter((e) => filter.types!.includes(e.type));
    }

    if (filter?.after !== undefined) {
      results = results.filter((e) => e.timestamp > filter.after!);
    }

    if (filter?.before !== undefined) {
      results = results.filter((e) => e.timestamp < filter.before!);
    }

    // Sort by sequence
    results.sort((a, b) => a.sequence - b.sequence);

    if (filter?.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async *replay(sessionId: string): AsyncGenerator<AgentEvent, void, unknown> {
    const events = this.list(sessionId);
    for (const event of events) {
      yield event;
    }
  }

  getEventCount(sessionId: string): number {
    return this.events.filter((e) => e.sessionId === sessionId).length;
  }

  getLatestSequence(sessionId: string): number {
    return this.sessionSequences.get(sessionId) ?? 0;
  }

  clearSession(sessionId: string): void {
    this.events = this.events.filter((e) => e.sessionId !== sessionId);
    this.sessionSequences.delete(sessionId);
  }

  async close(): Promise<void> {
    // No-op for in-memory store
  }
}
