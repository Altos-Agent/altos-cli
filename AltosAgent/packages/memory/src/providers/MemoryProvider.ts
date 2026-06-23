// @altos/memory - MemoryProvider interface

import type { AgentEvent } from "@altos/core";

/**
 * Supported memory provider backends.
 * Each provider implements the same MemoryProvider interface.
 */
export type MemoryProviderType = "local" | "hermes" | "memplace" | "codegraph";

/**
 * Options for searching memory.
 */
export interface MemorySearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Only return entries before this timestamp */
  before?: number;
  /** Only return entries after this timestamp */
  after?: number;
}

/**
 * A single memory search result.
 */
export interface MemorySearchResult {
  /** Unique identifier for this entry */
  id: string;
  /** The memory content */
  content: string;
  /** Unix timestamp (ms) when this was stored */
  timestamp: number;
  /** Relevance score from search (provider-specific) */
  score?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * A knowledge file stored in project memory.
 */
export interface ProjectKnowledge {
  /** Unique identifier */
  id: string;
  /** Human-readable title */
  title: string;
  /** The knowledge content */
  content: string;
  /** Tags for categorization */
  tags: string[];
  /** When this was created */
  createdAt: number;
  /** When this was last updated */
  updatedAt: number;
}

/**
 * Summary of a compacted session.
 * Preserves decisions, file changes, and test results
 * while dropping detailed tool arguments and repeated patterns.
 */
export interface SessionSummary {
  /** Session identifier */
  sessionId: string;
  /** When the session started (Unix ms) */
  startTime: number;
  /** When the session ended (Unix ms), if known */
  endTime?: number;
  /** Total number of events in the session */
  eventCount: number;
  /** Markdown summary of the session */
  summary: string;
  /** Key decisions made during the session */
  decisions: string[];
  /** Files that were modified */
  fileChanges: string[];
  /** Test results if any tests were run */
  testResults?: string[];
}

/**
 * MemoryProvider is the core interface for all memory backends.
 * All memory operations go through this interface.
 *
 * Memory is OPTIONAL - the system works without a memory provider,
 * but enabling memory allows long-term context retention.
 *
 * All write operations apply secret redaction automatically.
 */
export interface MemoryProvider {
  /** Unique identifier for this provider type */
  readonly id: MemoryProviderType;

  /** Human-readable name */
  readonly name: string;

  /**
   * Initialize the provider (async setup, connection, etc.).
   * Must be called before any other operations.
   */
  initialize(): Promise<void>;

  /** Check if the provider is ready to accept operations */
  isReady(): boolean;

  // -------------------------------------------------------------------------
  // Long-term memory (global + project)
  // -------------------------------------------------------------------------

  /**
   * Write to long-term memory.
   * Secrets are automatically redacted before storage.
   *
   * @param content - The content to store
   * @param scope - "global" for user-level memory, "project" for project-level
   * @returns The stored entry with its generated id and timestamp
   */
  writeMemory(content: string, scope: "global" | "project"): Promise<MemorySearchResult>;

  /**
   * Read entries from long-term memory.
   *
   * @param scope - "global" or "project"
   * @param limit - Maximum entries to return (oldest first)
   */
  readMemory(scope: "global" | "project", limit?: number): Promise<MemorySearchResult[]>;

  /**
   * Search across both global and project memory.
   *
   * @param query - Text query to search for
   * @param options - Search options (limit, before, after)
   */
  searchMemory(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;

  /**
   * Update an existing memory entry.
   * Secrets are automatically redacted.
   *
   * @param id - The entry id to update
   * @param content - New content
   * @returns The updated entry
   */
  updateMemory(id: string, content: string): Promise<MemorySearchResult>;

  /**
   * Delete a memory entry permanently.
   *
   * @param id - The entry id to delete
   */
  deleteMemory(id: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  /**
   * Summarize a session and store the compact representation.
   * Extracts decisions, file changes, and test results from raw events.
   *
   * @param sessionId - The session to summarize
   * @param events - Raw session events
   * @returns The session summary
   */
  summarizeSession(sessionId: string, events: AgentEvent[]): Promise<SessionSummary>;

  // -------------------------------------------------------------------------
  // Project knowledge
  // -------------------------------------------------------------------------

  /**
   * Get all project knowledge files.
   */
  getProjectKnowledge(): Promise<ProjectKnowledge[]>;

  /**
   * Add a project knowledge file.
   * Secrets are automatically redacted.
   *
   * @param title - Title for the knowledge entry
   * @param content - Knowledge content
   * @param tags - Optional tags for categorization
   */
  addProjectKnowledge(title: string, content: string, tags?: string[]): Promise<ProjectKnowledge>;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Shutdown the provider cleanly */
  close(): Promise<void>;
}
