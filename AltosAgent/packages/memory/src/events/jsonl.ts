// @altos/memory - JSONL Event Store Implementation

import { createReadStream, existsSync, mkdirSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import type { AgentEvent, EventFilter } from "@altos/core/events/types.js";
import { deserializeEvent } from "@altos/core/events/factory.js";
// EventStore is re-exported by memory/index.ts - use local type to avoid circular ref
import type { EventStore } from "../../../core/src/store/index.js";

/**
 * JSONL (JSON Lines) implementation of EventStore.
 *
 * Each event is stored as a single JSON line in a file.
 * Files are organized by session: {dataDir}/{sessionId}.jsonl
 *
 * Benefits:
 * - Append-only semantics by design
 * - Easy to inspect with standard tools (jq, etc.)
 * - Crash-resistant (no complex file formats)
 * - Can replay sessions directly from files
 */
export class JsonlEventStore implements EventStore {
  private dataDir: string;
  private sessionSequences: Map<string, number> = new Map();
  private sessionIndices: Map<string, number> = new Map(); // In-memory index for faster reads

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ensureDataDir();
    this.loadSessionIndices();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private sessionFile(sessionId: string): string {
    return join(this.dataDir, `${sessionId}.jsonl`);
  }

  private loadSessionIndices(): void {
    // Load existing session files and build indices
    if (!existsSync(this.dataDir)) return;

    const { readdirSync } = require("fs");
    try {
      const files = readdirSync(this.dataDir);
      for (const file of files) {
        if (file.endsWith(".jsonl")) {
          const sessionId = file.replace(".jsonl", "");
          const filePath = join(this.dataDir, file);
          const lines = this.countLines(filePath);
          this.sessionIndices.set(sessionId, lines);
        }
      }
    } catch {
      // Ignore errors during index loading
    }
  }

  private countLines(filePath: string): number {
    try {
      const content = readFileSync(filePath, "utf-8");
      return content.split("\n").filter((line) => line.trim()).length;
    } catch {
      return 0;
    }
  }

  append(event: AgentEvent): AgentEvent {
    const filePath = this.sessionFile(event.sessionId);
    const currentSeq = this.sessionSequences.get(event.sessionId) ?? 0;
    const newSeq = event.sequence === 0 ? currentSeq + 1 : event.sequence;

    const storedEvent = { ...event, sequence: newSeq };
    const line = JSON.stringify(storedEvent) + "\n";

    appendFileSync(filePath, line, "utf-8");

    this.sessionSequences.set(event.sessionId, newSeq);
    this.sessionIndices.set(event.sessionId, (this.sessionIndices.get(event.sessionId) ?? 0) + 1);

    return storedEvent;
  }

  list(sessionId: string, filter?: EventFilter): AgentEvent[] {
    const filePath = this.sessionFile(sessionId);

    if (!existsSync(filePath)) {
      return [];
    }

    const events: AgentEvent[] = [];
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const event = deserializeEvent(line);

        // Apply filters
        if (filter?.types && filter.types.length > 0) {
          if (!filter.types.includes(event.type)) continue;
        }

        if (filter?.after !== undefined && event.timestamp <= filter.after) {
          continue;
        }

        if (filter?.before !== undefined && event.timestamp >= filter.before) {
          continue;
        }

        events.push(event);
      } catch {
        // Skip malformed lines
      }
    }

    // Sort by sequence
    events.sort((a, b) => a.sequence - b.sequence);

    if (filter?.limit && filter.limit > 0) {
      return events.slice(0, filter.limit);
    }

    return events;
  }

  async *replay(sessionId: string): AsyncGenerator<AgentEvent, void, unknown> {
    const filePath = this.sessionFile(sessionId);

    if (!existsSync(filePath)) {
      return;
    }

    const readStream = createReadStream(filePath, { encoding: "utf-8" });
    let leftover = "";

    try {
      for await (const chunk of readStream) {
        const lines = (leftover + chunk).split("\n");
        leftover = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = deserializeEvent(line);
              yield event;
            } catch {
              // Skip malformed lines
            }
          }
        }
      }

      // Process any remaining content
      if (leftover.trim()) {
        try {
          const event = deserializeEvent(leftover);
          yield event;
        } catch {
          // Skip malformed lines
        }
      }
    } finally {
      readStream.destroy();
    }
  }

  getEventCount(sessionId: string): number {
    return this.sessionIndices.get(sessionId) ?? 0;
  }

  getLatestSequence(sessionId: string): number {
    return this.sessionSequences.get(sessionId) ?? 0;
  }

  clearSession(sessionId: string): void {
    const filePath = this.sessionFile(sessionId);

    if (existsSync(filePath)) {
      const { unlinkSync } = require("fs");
      unlinkSync(filePath);
    }

    this.sessionSequences.delete(sessionId);
    this.sessionIndices.delete(sessionId);
  }

  async close(): Promise<void> {
    // Nothing to close for JSONL store
  }
}

/**
 * Create a JSONL event store with the specified data directory.
 */
export function createJsonlEventStore(dataDir: string): EventStore {
  return new JsonlEventStore(dataDir);
}

/**
 * Create an in-memory event store that also persists to JSONL files.
 * Useful for testing or when you want both in-memory speed and persistence.
 */
export class HybridEventStore implements EventStore {
  private memoryStore: Map<string, AgentEvent[]> = new Map();
  private sequences: Map<string, number> = new Map();
  private jsonlStore?: JsonlEventStore;
  private persist: boolean;

  constructor(options: { persist?: boolean; dataDir?: string } = {}) {
    this.persist = options.persist ?? false;
    if (this.persist && options.dataDir) {
      this.jsonlStore = new JsonlEventStore(options.dataDir);
    }
  }

  append(event: AgentEvent): AgentEvent {
    const currentSeq = this.sequences.get(event.sessionId) ?? 0;
    const newSeq = event.sequence === 0 ? currentSeq + 1 : event.sequence;

    const storedEvent = { ...event, sequence: newSeq };

    // Store in memory
    if (!this.memoryStore.has(event.sessionId)) {
      this.memoryStore.set(event.sessionId, []);
    }
    this.memoryStore.get(event.sessionId)!.push(storedEvent);

    this.sequences.set(event.sessionId, newSeq);

    // Optionally persist to JSONL
    if (this.jsonlStore) {
      this.jsonlStore.append(storedEvent);
    }

    return storedEvent;
  }

  list(sessionId: string, filter?: EventFilter): AgentEvent[] {
    let events = this.memoryStore.get(sessionId) ?? [];

    if (filter?.types && filter.types.length > 0) {
      events = events.filter((e) => filter.types!.includes(e.type));
    }

    if (filter?.after !== undefined) {
      events = events.filter((e) => e.timestamp > filter.after!);
    }

    if (filter?.before !== undefined) {
      events = events.filter((e) => e.timestamp < filter.before!);
    }

    if (filter?.limit) {
      events = events.slice(0, filter.limit);
    }

    return events;
  }

  async *replay(sessionId: string): AsyncGenerator<AgentEvent, void, unknown> {
    for (const event of this.list(sessionId)) {
      yield event;
    }
  }

  getEventCount(sessionId: string): number {
    return this.memoryStore.get(sessionId)?.length ?? 0;
  }

  getLatestSequence(sessionId: string): number {
    return this.sequences.get(sessionId) ?? 0;
  }

  clearSession(sessionId: string): void {
    this.memoryStore.delete(sessionId);
    this.sequences.delete(sessionId);
    if (this.jsonlStore) {
      this.jsonlStore.clearSession(sessionId);
    }
  }

  async close(): Promise<void> {
    if (this.jsonlStore) {
      await this.jsonlStore.close();
    }
  }
}
