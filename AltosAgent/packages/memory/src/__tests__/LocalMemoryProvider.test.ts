// @altos/memory - LocalMemoryProvider tests

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { LocalMemoryProvider } from "../providers/LocalMemoryProvider.js";
import type { AgentEvent } from "@altos/core";

// Mock fs/promises for testing
vi.mock("fs/promises", async () => {
  const actual = await vi.importActual("fs/promises");
  return actual;
});

describe("LocalMemoryProvider", () => {
  let tempDir: string;
  let provider: LocalMemoryProvider;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "altos-memory-test-"));
    provider = new LocalMemoryProvider(tempDir);
    await provider.initialize();
  });

  afterEach(async () => {
    await provider.close();
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("initialize", () => {
    it("should set ready state to true after init", () => {
      expect(provider.isReady()).toBe(true);
    });

    it("should create required directories", () => {
      const expectedDirs = [
        path.join(tempDir, ".altos", "memory"),
        path.join(tempDir, ".altos", "memory", "sessions"),
        path.join(tempDir, ".altos", "memory", "knowledge"),
      ];
      for (const dir of expectedDirs) {
        expect(fs.existsSync(dir)).toBe(true);
      }
    });

    it("should create project memory file", () => {
      const projectMemoryPath = path.join(tempDir, ".altos", "memory", "project.md");
      expect(fs.existsSync(projectMemoryPath)).toBe(true);
    });
  });

  describe("writeMemory", () => {
    it("should write to project memory", async () => {
      const result = await provider.writeMemory("Test content", "project");
      expect(result.content).toBe("Test content");
      expect(result.id).toMatch(/^project-\d+$/);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it("should write to global memory", async () => {
      const result = await provider.writeMemory("Global content", "global");
      expect(result.content).toBe("Global content");
      expect(result.id).toMatch(/^global-\d+$/);
    });

    it("should redact secrets before storing", async () => {
      const content =
        "My API key is sk-1234567890abcdefghijklmnopqrstuvwxyz and password is secret123";
      const result = await provider.writeMemory(content, "project");
      expect(result.content).toBe("My API key is [REDACTED] and password is [REDACTED]");
      expect(result.content).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
      expect(result.content).not.toContain("secret123");
    });

    it("should append to existing content", async () => {
      await provider.writeMemory("First entry", "project");
      await provider.writeMemory("Second entry", "project");
      const entries = await provider.readMemory("project", 10);
      const contents = entries.map((e) => e.content);
      expect(contents).toContain("First entry");
      expect(contents).toContain("Second entry");
    });

    it("should throw if not initialized", async () => {
      const uninitProvider = new LocalMemoryProvider();
      await expect(uninitProvider.writeMemory("test", "project")).rejects.toThrow(
        "LocalMemoryProvider not initialized",
      );
    });
  });

  describe("readMemory", () => {
    it("should return written entries", async () => {
      await provider.writeMemory("Entry 1", "project");
      await provider.writeMemory("Entry 2", "project");
      const entries = await provider.readMemory("project", 10);
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it("should return most recent entries first with limit", async () => {
      await provider.writeMemory("First", "project");
      await provider.writeMemory("Second", "project");
      const entries = await provider.readMemory("project", 1);
      expect(entries.length).toBe(1);
    });

    it("should return empty array for unknown scope without project root", async () => {
      const globalOnlyProvider = new LocalMemoryProvider();
      await globalOnlyProvider.initialize();
      const entries = await globalOnlyProvider.readMemory("project");
      await globalOnlyProvider.close();
      // No project root means project memory returns empty
      expect(entries).toEqual([]);
    });

    it("should return empty array for empty memory", async () => {
      const newProvider = new LocalMemoryProvider(
        fs.mkdtempSync(path.join(os.tmpdir(), "altos-empty-")),
      );
      await newProvider.initialize();
      const entries = await newProvider.readMemory("project", 10);
      expect(entries).toEqual([]);
      await newProvider.close();
      fs.rmSync(newProvider as unknown as string, { recursive: true, force: true });
    });
  });

  describe("searchMemory", () => {
    it("should find entries by query", async () => {
      await provider.writeMemory("apples and oranges", "project");
      await provider.writeMemory("bananas are yellow", "project");
      const results = await provider.searchMemory("apples");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].content).toContain("apples");
    });

    it("should return empty for no matches", async () => {
      await provider.writeMemory("apples and oranges", "project");
      const results = await provider.searchMemory("xyz123nonexistent");
      expect(results.length).toBe(0);
    });

    it("should search across both global and project memory", async () => {
      await provider.writeMemory("project content about dogs", "project");
      await provider.writeMemory("global content about cats", "global");
      const results = await provider.searchMemory("dogs");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("should respect limit option", async () => {
      for (let i = 0; i < 5; i++) {
        await provider.writeMemory(`content ${i} with keyword`, "project");
      }
      const results = await provider.searchMemory("keyword", { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should be case insensitive", async () => {
      await provider.writeMemory("Apples AND Oranges", "project");
      const results = await provider.searchMemory("apples");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("updateMemory", () => {
    it("should update existing entry", async () => {
      const original = await provider.writeMemory("Original content", "project");
      const updated = await provider.updateMemory(original.id, "Updated content");
      expect(updated.content).toBe("Updated content");
      expect(updated.id).toContain("project-");
    });

    it("should redact secrets on update", async () => {
      const original = await provider.writeMemory("Original", "project");
      const updated = await provider.updateMemory(
        original.id,
        "API key: sk-1234567890abcdefghijklmnopqrstuvwxyz",
      );
      expect(updated.content).toBe("API key: [REDACTED]");
      expect(updated.content).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
    });

    it("should append if entry not found", async () => {
      const result = await provider.updateMemory("nonexistent-id", "New content");
      expect(result.content).toBe("New content");
    });
  });

  describe("deleteMemory", () => {
    it("should remove entry from memory", async () => {
      const entry = await provider.writeMemory("To be deleted", "project");
      await provider.deleteMemory(entry.id);
      const results = await provider.searchMemory("To be deleted");
      // After deletion, the entry should not be found
      const found = results.some((r) => r.id === entry.id);
      expect(found).toBe(false);
    });

    it("should not throw for nonexistent id", async () => {
      await expect(provider.deleteMemory("nonexistent-id")).resolves.not.toThrow();
    });
  });

  describe("summarizeSession", () => {
    it("should create summary from events", async () => {
      const mockEvents: AgentEvent[] = [
        {
          id: "evt_1",
          type: "assistant_message",
          sessionId: "test-session",
          sequence: 1,
          timestamp: Date.now() - 10000,
          payload: { content: "I will implement this feature" },
        },
        {
          id: "evt_2",
          type: "file_patch_applied",
          sessionId: "test-session",
          sequence: 2,
          timestamp: Date.now() - 5000,
          payload: { file: "test.ts", patch: "+ new code", success: true },
        },
      ];

      const summary = await provider.summarizeSession("test-session", mockEvents);

      expect(summary.sessionId).toBe("test-session");
      expect(summary.eventCount).toBe(2);
      expect(summary.decisions.length).toBeGreaterThan(0);
      expect(summary.fileChanges).toContain("test.ts");
      expect(summary.summary).toContain("Session Compaction Summary");
    });

    it("should store summary as knowledge", async () => {
      const mockEvents: AgentEvent[] = [
        {
          id: "evt_3",
          type: "assistant_message",
          sessionId: "test-session",
          sequence: 1,
          timestamp: Date.now(),
          payload: { content: "I decided to use TypeScript" },
        },
      ];

      await provider.summarizeSession("test-session", mockEvents);

      const knowledge = await provider.getProjectKnowledge();
      expect(knowledge.length).toBeGreaterThan(0);
      const sessionSummary = knowledge.find((k) => k.tags.includes("session-summary"));
      expect(sessionSummary).toBeDefined();
    });
  });

  describe("project knowledge", () => {
    it("should add and retrieve project knowledge", async () => {
      const knowledge = await provider.addProjectKnowledge(
        "Test Knowledge",
        "This is test knowledge content",
        ["test", "example"],
      );

      expect(knowledge.title).toBe("Test Knowledge");
      expect(knowledge.content).toBe("This is test knowledge content");
      expect(knowledge.tags).toEqual(["test", "example"]);
      expect(knowledge.id).toBeTruthy();
    });

    it("should redact secrets in project knowledge", async () => {
      const knowledge = await provider.addProjectKnowledge(
        "API Notes",
        "API key for service: sk-1234567890abcdefghijklmnopqrstuvwxyz",
        ["api"],
      );

      expect(knowledge.content).toBe("API key for service: [REDACTED]");
      expect(knowledge.content).not.toContain("sk-1234567890abcdefghijklmnopqrstuvwxyz");
    });

    it("should list all project knowledge", async () => {
      await provider.addProjectKnowledge("Knowledge 1", "Content 1", ["tag1"]);
      await provider.addProjectKnowledge("Knowledge 2", "Content 2", ["tag2"]);

      const knowledge = await provider.getProjectKnowledge();
      expect(knowledge.length).toBeGreaterThanOrEqual(2);
    });

    it("should return empty array when no knowledge exists", async () => {
      const cleanProvider = new LocalMemoryProvider(
        fs.mkdtempSync(path.join(os.tmpdir(), "altos-clean-")),
      );
      await cleanProvider.initialize();
      const knowledge = await cleanProvider.getProjectKnowledge();
      expect(knowledge).toEqual([]);
      await cleanProvider.close();
      fs.rmSync(cleanProvider as unknown as string, { recursive: true, force: true });
    });
  });

  describe("close", () => {
    it("should set ready to false", async () => {
      expect(provider.isReady()).toBe(true);
      await provider.close();
      expect(provider.isReady()).toBe(false);
    });
  });

  describe("secret redaction integration", () => {
    it("should redact GitHub tokens when writing", async () => {
      const content = "GitHub token: ghp_abcdefghijklmnopqrstuvwxyz1234567890";
      const result = await provider.writeMemory(content, "project");
      expect(result.content).toBe("GitHub token: [REDACTED]");
    });

    it("should redact Bearer tokens when writing", async () => {
      const content =
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjg";
      const result = await provider.writeMemory(content, "project");
      expect(result.content).toBe("Bearer [REDACTED]");
      expect(result.content).not.toContain("eyJ");
    });

    it("should redact database passwords in connection strings", async () => {
      const content = "mysql://user:secretpassword@localhost:3306/mydb";
      const result = await provider.writeMemory(content, "project");
      expect(result.content).toBe("mysql://user:[REDACTED]@localhost:3306/mydb");
    });
  });
});
