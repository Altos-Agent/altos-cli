// @altos/memory - Memory and conversation history

// Event store implementations
export * from "./events/jsonl.js";

// Provider exports
export * from "./providers/index.js";

// Re-export provider types for convenience
export type {
  MemoryProvider,
  MemoryProviderType,
  MemorySearchOptions,
  MemorySearchResult,
  ProjectKnowledge,
  SessionSummary,
} from "./providers/MemoryProvider.js";

// Secret redaction
export { redactSecrets, containsSecrets } from "./redaction.js";

// Session compaction
export { compactSessionEvents, redactAndCompactSessionEvents } from "./compaction.js";

export interface MemoryEntry {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryStore {
  add(entry: Omit<MemoryEntry, "id">): MemoryEntry;
  get(id: string): MemoryEntry | undefined;
  list(limit?: number, offset?: number): MemoryEntry[];
  search(query: string, limit?: number): MemoryEntry[];
  clear(): void;
}

export class InMemoryStore implements MemoryStore {
  private entries: MemoryEntry[] = [];
  private counter = 0;

  add(entry: Omit<MemoryEntry, "id">): MemoryEntry {
    const e: MemoryEntry = { ...entry, id: `mem_${++this.counter}` };
    this.entries.push(e);
    return e;
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  list(limit = 100, offset = 0): MemoryEntry[] {
    return this.entries.slice(offset, offset + limit);
  }

  search(query: string, limit = 10): MemoryEntry[] {
    const q = query.toLowerCase();
    return this.entries.filter((e) => e.content.toLowerCase().includes(q)).slice(0, limit);
  }

  clear(): void {
    this.entries = [];
  }
}

export interface EmbeddingResult {
  vector: number[];
  text: string;
}

export interface VectorStore {
  add(embedding: EmbeddingResult): void;
  search(query: number[], limit?: number): { entry: EmbeddingResult; score: number }[];
}

export function createMemoryStore(): MemoryStore {
  return new InMemoryStore();
}
