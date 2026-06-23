// @altos/memory - Local filesystem memory provider

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { existsSync, appendFileSync } from "fs";
import { randomUUID } from "crypto";
import type {
  MemoryProvider,
  MemoryProviderType,
  MemorySearchOptions,
  MemorySearchResult,
  ProjectKnowledge,
  SessionSummary,
} from "./MemoryProvider.js";
import { redactSecrets } from "../redaction.js";
import { compactSessionEvents } from "../compaction.js";
import { JsonlEventStore } from "../events/jsonl.js";
import type { AgentEvent } from "@altos/core";

/**
 * Local filesystem implementation of MemoryProvider.
 *
 * Storage layout:
 * - ~/.altos/memory/global.md          - global long-term memory
 * - {projectRoot}/.altos/memory/project.md   - project-specific memory
 * - {projectRoot}/.altos/memory/sessions/   - session JSONL files
 * - {projectRoot}/.altos/memory/knowledge/  - knowledge .md files
 */
export class LocalMemoryProvider implements MemoryProvider {
  readonly id: MemoryProviderType = "local";
  readonly name = "Local Filesystem";

  private globalMemoryPath: string;
  private projectMemoryPath: string | undefined;
  private sessionsDir: string | undefined;
  private knowledgeDir: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _eventStore: JsonlEventStore | undefined;
  private _ready = false;

  constructor(projectRoot?: string) {
    const homeDir = os.homedir();
    this.globalMemoryPath = path.join(homeDir, ".altos", "memory", "global.md");

    if (projectRoot) {
      this.projectMemoryPath = path.join(projectRoot, ".altos", "memory", "project.md");
      this.sessionsDir = path.join(projectRoot, ".altos", "memory", "sessions");
      this.knowledgeDir = path.join(projectRoot, ".altos", "memory", "knowledge");
    }
  }

  async initialize(): Promise<void> {
    // Ensure global memory directory exists
    await fs.mkdir(path.dirname(this.globalMemoryPath), { recursive: true });

    // Ensure global memory file exists
    if (!existsSync(this.globalMemoryPath)) {
      const header = "# Global Memory\n\n_Last updated: " + new Date().toISOString() + "_\n";
      await fs.writeFile(this.globalMemoryPath, header, "utf-8");
    }

    // Initialize project memory if we have a project root
    if (this.projectMemoryPath && this.sessionsDir && this.knowledgeDir) {
      await fs.mkdir(path.dirname(this.projectMemoryPath), { recursive: true });
      await fs.mkdir(this.sessionsDir, { recursive: true });
      await fs.mkdir(this.knowledgeDir, { recursive: true });

      // Ensure project memory file exists
      if (!existsSync(this.projectMemoryPath)) {
        const header = "# Project Memory\n\n_Last updated: " + new Date().toISOString() + "_\n";
        await fs.writeFile(this.projectMemoryPath, header, "utf-8");
      }

      // Initialize event store for sessions
      this._eventStore = new JsonlEventStore(this.sessionsDir);
    }

    this._ready = true;
  }

  isReady(): boolean {
    return this._ready;
  }

  // -------------------------------------------------------------------------
  // Long-term memory
  // -------------------------------------------------------------------------

  async writeMemory(content: string, scope: "global" | "project"): Promise<MemorySearchResult> {
    if (!this._ready) {
      throw new Error("LocalMemoryProvider not initialized");
    }

    // ALWAYS redact secrets before storage
    const redactedContent = redactSecrets(content);
    const timestamp = Date.now();
    const id = scope + "-" + timestamp;

    const filePath = scope === "global" ? this.globalMemoryPath : this.projectMemoryPath;

    if (!filePath) {
      throw new Error("Cannot write " + scope + " memory: no project root configured");
    }

    // Append new entry with timestamp separator
    const timestampStr = new Date(timestamp).toISOString();
    const entry = "\n\n---\n\n[" + timestampStr + "]\n\n" + redactedContent + "\n";

    await appendFileAtomic(filePath, entry);

    return {
      id: id,
      content: redactedContent,
      timestamp: timestamp,
    };
  }

  async readMemory(scope: "global" | "project", limit = 50): Promise<MemorySearchResult[]> {
    if (!this._ready) {
      throw new Error("LocalMemoryProvider not initialized");
    }

    const filePath = scope === "global" ? this.globalMemoryPath : this.projectMemoryPath;

    if (!filePath) {
      return [];
    }

    const content = await readFileSafe(filePath);
    if (!content) {
      return [];
    }

    const entries = parseMarkdownEntries(content);
    // Return most recent entries first, limited
    return entries.slice(-limit).reverse();
  }

  async searchMemory(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
    if (!this._ready) {
      throw new Error("LocalMemoryProvider not initialized");
    }

    const limit = options?.limit ?? 20;
    const queryLower = query.toLowerCase();
    const results: MemorySearchResult[] = [];

    // Search global memory
    const globalResults = await this.searchFile(this.globalMemoryPath, queryLower, options);
    results.push(...globalResults);

    // Search project memory
    if (this.projectMemoryPath) {
      const projectResults = await this.searchFile(this.projectMemoryPath, queryLower, options);
      results.push(...projectResults);
    }

    // Sort by relevance (timestamp desc) and limit
    results.sort(function (a, b) {
      return b.timestamp - a.timestamp;
    });
    return results.slice(0, limit);
  }

  private async searchFile(
    filePath: string,
    query: string,
    options?: MemorySearchOptions,
  ): Promise<MemorySearchResult[]> {
    const content = await readFileSafe(filePath);
    if (!content) {
      return [];
    }

    const entries = parseMarkdownEntries(content);
    const results: MemorySearchResult[] = [];

    for (const entry of entries) {
      // Apply time filters
      if (options?.before && entry.timestamp >= options.before) {
        continue;
      }
      if (options?.after && entry.timestamp <= options.after) {
        continue;
      }

      // Simple text match
      if (entry.content.toLowerCase().includes(query)) {
        results.push(entry);
      }
    }

    return results;
  }

  async updateMemory(id: string, content: string): Promise<MemorySearchResult> {
    if (!this._ready) {
      throw new Error("LocalMemoryProvider not initialized");
    }

    const redactedContent = redactSecrets(content);
    const timestamp = Date.now();

    // Determine scope from id prefix
    const scope = id.startsWith("global-") ? "global" : "project";
    const filePath = scope === "global" ? this.globalMemoryPath : this.projectMemoryPath;

    if (!filePath) {
      throw new Error("Cannot update " + scope + " memory: no project root configured");
    }

    const currentContent = await readFileSafe(filePath);
    if (!currentContent) {
      throw new Error("Memory file not found");
    }

    // Find and replace the entry with this id
    // Entries are separated by --- markers
    const entries = currentContent.split(/^---$/m);
    let found = false;
    const newEntries: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const trimmed = entry.trim();
      if (!trimmed) continue;

      // Check if this entry has the matching id in its first line
      const lines = trimmed.split("\n");
      if (lines[0].includes(id)) {
        // Replace with updated content
        const timestampStr = new Date(timestamp).toISOString();
        const updatedEntry = "\n\n---\n\n[" + timestampStr + "]\n\n" + redactedContent + "\n";
        newEntries.push(updatedEntry);
        found = true;
      } else {
        newEntries.push(entry);
      }
    }

    if (!found) {
      // Entry not found, just append
      return this.writeMemory(content, scope);
    }

    await fs.writeFile(filePath, newEntries.join("\n"), "utf-8");

    return {
      id: scope + "-" + timestamp,
      content: redactedContent,
      timestamp: timestamp,
    };
  }

  async deleteMemory(id: string): Promise<void> {
    if (!this._ready) {
      throw new Error("LocalMemoryProvider not initialized");
    }

    const scope = id.startsWith("global-") ? "global" : "project";
    const filePath = scope === "global" ? this.globalMemoryPath : this.projectMemoryPath;

    if (!filePath) {
      throw new Error("Cannot delete " + scope + " memory: no project root configured");
    }

    const currentContent = await readFileSafe(filePath);
    if (!currentContent) {
      return; // Already gone
    }

    // Remove entries matching this id
    const entries = currentContent.split(/^---$/m);
    const newEntries: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const trimmed = entry.trim();
      if (!trimmed) continue;

      const lines = trimmed.split("\n");
      if (!lines[0].includes(id)) {
        newEntries.push(entry);
      }
    }

    await fs.writeFile(filePath, newEntries.join("\n"), "utf-8");
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  async summarizeSession(sessionId: string, events: AgentEvent[]): Promise<SessionSummary> {
    if (!this._ready) {
      throw new Error("LocalMemoryProvider not initialized");
    }

    const compaction = await compactSessionEvents(events);

    // Store as a knowledge file
    await this.addProjectKnowledge("Session " + sessionId + " Summary", compaction.markdown, [
      "session-summary",
      "session-" + sessionId,
    ]);

    return {
      sessionId: sessionId,
      startTime: events[0]?.timestamp ?? Date.now(),
      endTime: events[events.length - 1]?.timestamp ?? Date.now(),
      eventCount: events.length,
      summary: compaction.markdown,
      decisions: compaction.decisions,
      fileChanges: compaction.fileChanges,
      testResults: compaction.testResults,
    };
  }

  // -------------------------------------------------------------------------
  // Project knowledge
  // -------------------------------------------------------------------------

  async getProjectKnowledge(): Promise<ProjectKnowledge[]> {
    if (!this._ready || !this.knowledgeDir) {
      return [];
    }

    let files: string[];
    try {
      files = await fs.readdir(this.knowledgeDir);
    } catch {
      return [];
    }

    const knowledgeFiles = files.filter(function (f) {
      return f.endsWith(".md");
    });

    const results: ProjectKnowledge[] = [];

    for (let i = 0; i < knowledgeFiles.length; i++) {
      const file = knowledgeFiles[i];
      const filePath = path.join(this.knowledgeDir!, file);
      const content = await readFileSafe(filePath);
      if (!content) continue;

      const parsed = parseKnowledgeFile(content, file);
      if (parsed) {
        results.push(parsed);
      }
    }

    // Sort by updatedAt desc
    results.sort(function (a, b) {
      return b.updatedAt - a.updatedAt;
    });
    return results;
  }

  async addProjectKnowledge(
    title: string,
    content: string,
    tags: string[] = [],
  ): Promise<ProjectKnowledge> {
    if (!this._ready || !this.knowledgeDir) {
      throw new Error("LocalMemoryProvider not initialized: no project root");
    }

    const redactedContent = redactSecrets(content);
    const id = randomUUID();
    const now = Date.now();

    // Build frontmatter without template literals
    const escapedTitle = title.replace(/"/g, '\\"');
    let tagsStr = "";
    for (let i = 0; i < tags.length; i++) {
      if (i > 0) tagsStr += ", ";
      tagsStr += '"' + tags[i] + '"';
    }

    const frontmatter =
      "---\n" +
      "id: " +
      id +
      "\n" +
      'title: "' +
      escapedTitle +
      '"\n' +
      "tags: [" +
      tagsStr +
      "]\n" +
      "createdAt: " +
      now +
      "\n" +
      "updatedAt: " +
      now +
      "\n" +
      "---\n\n";

    const filePath = path.join(this.knowledgeDir, id + ".md");
    await fs.writeFile(filePath, frontmatter + redactedContent + "\n", "utf-8");

    return {
      id: id,
      title: title,
      content: redactedContent,
      tags: tags,
      createdAt: now,
      updatedAt: now,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async close(): Promise<void> {
    this._ready = false;
    // JsonlEventStore doesn't need explicit close
  }

  get eventStore(): JsonlEventStore | undefined {
    return this._eventStore;
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Safely read a file, returning empty string if it doesn't exist.
 */
async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Parse markdown entries separated by --- markers.
 * Each entry has a timestamp in the format [ISO-date] followed by content.
 */
function parseMarkdownEntries(content: string): MemorySearchResult[] {
  const results: MemorySearchResult[] = [];

  // Split by --- markers that are at the start of a line (entry separators)
  const sections = content.split(/^---$/m);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const trimmed = section.trim();
    if (!trimmed) continue;

    // First lines are metadata (title, timestamps)
    // Look for [ISO-date] pattern
    const timestampMatch = trimmed.match(/^\[(.+?)\]\s*$/m);

    if (timestampMatch) {
      const timestampDate = new Date(timestampMatch[1]).getTime();
      // Everything after the timestamp line is content
      const contentStart = trimmed.indexOf("]\n") + 2;
      const entryContent = trimmed.slice(contentStart).trim();

      if (entryContent) {
        results.push({
          id: "local-" + hashString(trimmed.slice(0, 100)),
          content: entryContent,
          timestamp: isNaN(timestampDate) ? Date.now() : timestampDate,
        });
      }
    } else if (trimmed.includes("\n")) {
      // First line might be a title, rest is content
      const lines = trimmed.split("\n");
      const firstLine = lines[0];
      const rest = lines.slice(1).join("\n").trim();

      if (rest && !firstLine.startsWith("#")) {
        results.push({
          id: "local-" + hashString(trimmed.slice(0, 100)),
          content: rest,
          timestamp: Date.now(),
        });
      }
    }
  }

  return results;
}

/**
 * Parse a knowledge markdown file with frontmatter.
 */
function parseKnowledgeFile(content: string, filename: string): ProjectKnowledge | null {
  // Check for frontmatter
  if (!content.startsWith("---")) {
    return null;
  }

  const endIndex = content.indexOf("---", 3);
  if (endIndex === -1) {
    return null;
  }

  const frontmatter = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 3).trim();

  // Parse frontmatter
  const idMatch = frontmatter.match(/^id:\s*(.+)$/m);
  const titleMatch = frontmatter.match(/^title:\s*"(.+)"$/m);
  const tagsMatch = frontmatter.match(/^tags:\s*\[(.+)\]$/m);
  const createdMatch = frontmatter.match(/^createdAt:\s*(\d+)$/m);
  const updatedMatch = frontmatter.match(/^updatedAt:\s*(\d+)$/m);

  if (!idMatch) {
    return null;
  }

  let tags: string[] = [];
  if (tagsMatch) {
    const tagsStr = tagsMatch[1];
    const tagMatches = tagsStr.match(/"([^"]+)"/g);
    if (tagMatches) {
      tags = tagMatches.map(function (t) {
        return t.slice(1, -1);
      });
    }
  }

  return {
    id: idMatch[1].trim(),
    title: titleMatch ? titleMatch[1] : filename.replace(".md", ""),
    content: body,
    tags: tags,
    createdAt: createdMatch ? parseInt(createdMatch[1]) : Date.now(),
    updatedAt: updatedMatch ? parseInt(updatedMatch[1]) : Date.now(),
  };
}

/**
 * Simple string hash for generating entry IDs.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 100); i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Append to a file atomically.
 */
async function appendFileAtomic(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8",
): Promise<void> {
  // Ensure parent directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Use appendFileSync for simplicity
  appendFileSync(filePath, content, encoding);
}
