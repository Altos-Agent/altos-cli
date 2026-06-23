// @altos/memory - CodeGraph memory provider (placeholder)

import type {
  MemoryProvider,
  MemoryProviderType,
  MemorySearchOptions,
  MemorySearchResult,
  ProjectKnowledge,
  SessionSummary,
} from "./MemoryProvider.js";
import type { AgentEvent } from "@altos/core";

/**
 * CodeGraph memory provider.
 *
 * This is a PLACEHOLDER implementation - no real CodeGraph
 * integration is implemented yet. The interface is fully defined
 * so that integration can be added later.
 *
 * To implement real CodeGraph support:
 * 1. Add the CodeGraph client library as a dependency
 * 2. Implement initialize() to connect to CodeGraph index
 * 3. Implement writeMemory to store as code annotations in CodeGraph
 * 4. Implement searchMemory to use CodeGraph's semantic code search
 * 5. Implement getProjectKnowledge to query code knowledge base
 */
export class CodeGraphMemoryProvider implements MemoryProvider {
  readonly id: MemoryProviderType = "codegraph";
  readonly name = "CodeGraph";

  private _ready = false;

  async initialize(): Promise<void> {
    // Placeholder - no network integration
    console.log("[CodeGraphMemoryProvider] Initialized (placeholder - no CodeGraph integration)");
    this._ready = true;
  }

  isReady(): boolean {
    return this._ready;
  }

  async writeMemory(_content: string, _scope: "global" | "project"): Promise<MemorySearchResult> {
    throw new Error(
      "CodeGraph provider not implemented - this is a placeholder. " +
        "To enable, implement CodeGraph client integration.",
    );
  }

  async readMemory(_scope: "global" | "project", _limit?: number): Promise<MemorySearchResult[]> {
    return [];
  }

  async searchMemory(
    _query: string,
    _options?: MemorySearchOptions,
  ): Promise<MemorySearchResult[]> {
    return [];
  }

  async updateMemory(_id: string, _content: string): Promise<MemorySearchResult> {
    throw new Error("CodeGraph provider not implemented - placeholder");
  }

  async deleteMemory(_id: string): Promise<void> {
    // No-op for placeholder
  }

  async summarizeSession(_sessionId: string, _events: AgentEvent[]): Promise<SessionSummary> {
    throw new Error("CodeGraph provider not implemented - placeholder");
  }

  async getProjectKnowledge(): Promise<ProjectKnowledge[]> {
    return [];
  }

  async addProjectKnowledge(
    _title: string,
    _content: string,
    _tags?: string[],
  ): Promise<ProjectKnowledge> {
    throw new Error("CodeGraph provider not implemented - placeholder");
  }

  async close(): Promise<void> {
    this._ready = false;
  }
}
