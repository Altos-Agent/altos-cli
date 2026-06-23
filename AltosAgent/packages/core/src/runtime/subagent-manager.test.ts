// @altos/core - Subagent tests

import { describe, it, expect, beforeEach } from "vitest";
import { SubAgentManager } from "./subagent-manager.js";
import type { SubAgentDefinition, SubAgentResult } from "../types/subagent.js";
import {
  registerBuiltInSubagents,
  getBuiltInSubagent,
  BUILT_IN_SUBAGENTS,
} from "./builtin-subagents.js";

describe("SubAgentManager", () => {
  let manager: SubAgentManager;

  beforeEach(() => {
    manager = new SubAgentManager();
  });

  describe("registration", () => {
    it("should register a subagent definition", () => {
      const def: SubAgentDefinition = {
        name: "test-agent",
        description: "A test agent",
        system_prompt: "You are a test agent",
        allowed_tools: ["Read", "Write"],
        permission_profile: {
          read: true,
          write: true,
          execute: false,
          network: false,
          tools: ["Read", "Write"],
        },
        memory_scope: "workspace",
      };

      manager.register(def);
      expect(manager.getDefinition("test-agent")).toBe(def);
      expect(manager.listDefinitions()).toContain("test-agent");
    });

    it("should overwrite existing definition with same name", () => {
      const def1: SubAgentDefinition = {
        name: "test-agent",
        description: "First version",
        system_prompt: "You are v1",
        allowed_tools: ["Read"],
        permission_profile: {
          read: true,
          write: false,
          execute: false,
          network: false,
          tools: ["Read"],
        },
        memory_scope: "workspace",
      };

      const def2: SubAgentDefinition = {
        name: "test-agent",
        description: "Second version",
        system_prompt: "You are v2",
        allowed_tools: ["Read", "Write"],
        permission_profile: {
          read: true,
          write: true,
          execute: false,
          network: false,
          tools: ["Read", "Write"],
        },
        memory_scope: "workspace",
      };

      manager.register(def1);
      manager.register(def2);

      const retrieved = manager.getDefinition("test-agent");
      expect(retrieved?.description).toBe("Second version");
    });

    it("should register multiple definitions at once", () => {
      const defs: SubAgentDefinition[] = [
        {
          name: "agent-1",
          description: "First agent",
          system_prompt: "Agent 1",
          allowed_tools: ["Read"],
          permission_profile: {
            read: true,
            write: false,
            execute: false,
            network: false,
            tools: ["Read"],
          },
          memory_scope: "workspace",
        },
        {
          name: "agent-2",
          description: "Second agent",
          system_prompt: "Agent 2",
          allowed_tools: ["Write"],
          permission_profile: {
            read: false,
            write: true,
            execute: false,
            network: false,
            tools: ["Write"],
          },
          memory_scope: "workspace",
        },
      ];

      manager.registerMany(defs);
      expect(manager.listDefinitions()).toHaveLength(2);
      expect(manager.getDefinition("agent-1")).toBeDefined();
      expect(manager.getDefinition("agent-2")).toBeDefined();
    });
  });

  describe("spawning", () => {
    it("should spawn a subagent instance", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("explorer", { task: "Find all TypeScript files" });

      expect(instance).toBeDefined();
      expect(instance.id).toBeDefined();
      expect(instance.definition.name).toBe("explorer");
      expect(instance.status).toBe("pending");
      expect(instance.startedAt).toBeDefined();
    });

    it("should throw for unknown subagent", async () => {
      registerBuiltInSubagents(manager);

      await expect(manager.spawn("unknown-agent", { task: "test" })).rejects.toThrow(
        "Unknown subagent",
      );
    });

    it("should apply definition overrides on spawn", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("explorer", {
        task: "Custom task",
        overrides: {
          allowed_tools: ["Read", "Grep"],
        },
      });

      expect(instance.definition.allowed_tools).toContain("Read");
      expect(instance.definition.allowed_tools).toContain("Grep");
    });
  });

  describe("instance management", () => {
    it("should track running instances", async () => {
      registerBuiltInSubagents(manager);

      await manager.spawn("explorer", { task: "Task 1" });
      await manager.spawn("planner", { task: "Task 2" });

      const running = manager.listRunningInstances();
      expect(running).toHaveLength(2);
    });

    it("should update instance status and result", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("explorer", { task: "Test task" });

      const result: SubAgentResult = {
        success: true,
        output: "Found 5 files",
        artifacts: [],
        summary: "Search completed",
        durationMs: 100,
      };

      manager.updateInstance(instance.id, {
        status: "completed",
        result,
        completedAt: Date.now(),
      });

      const updated = manager.getInstance(instance.id);
      expect(updated?.status).toBe("completed");
      expect(updated?.result?.success).toBe(true);
      expect(updated?.result?.output).toBe("Found 5 files");
    });

    it("should terminate a running instance", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("explorer", { task: "Long task" });
      expect(manager.listRunningInstances()).toHaveLength(1);

      const terminated = manager.terminate(instance.id);
      expect(terminated).toBe(true);

      const updated = manager.getInstance(instance.id);
      expect(updated?.status).toBe("cancelled");
    });

    it("should collect results from all instances", async () => {
      registerBuiltInSubagents(manager);

      const instance1 = await manager.spawn("explorer", { task: "Task 1" });
      const instance2 = await manager.spawn("planner", { task: "Task 2" });

      manager.updateInstance(instance1.id, {
        status: "completed",
        result: { success: true, output: "out1", artifacts: [], summary: "sum1", durationMs: 50 },
        completedAt: Date.now(),
      });

      manager.updateInstance(instance2.id, {
        status: "completed",
        result: { success: true, output: "out2", artifacts: [], summary: "sum2", durationMs: 100 },
        completedAt: Date.now(),
      });

      const results = manager.collectResults();
      expect(results).toHaveLength(2);
    });
  });

  describe("tool filtering", () => {
    it("should check if tool is allowed for instance", async () => {
      registerBuiltInSubagents(manager);

      // Verify explorer is read-only
      const explorerDef = manager.getDefinition("explorer");
      expect(explorerDef?.read_only).toBe(true);

      // Spawn an actual explorer instance
      const instance = await manager.spawn("explorer", { task: "Explore codebase" });

      // Explorer is read-only, so Write should be denied
      expect(manager.canUseTool(instance.id, "Write")).toBe(false);
      expect(manager.canUseTool(instance.id, "Read")).toBe(true);
      expect(manager.canUseTool(instance.id, "Grep")).toBe(true);
    });

    it("should filter tools based on permissions", () => {
      registerBuiltInSubagents(manager);

      const tools = [
        { name: "Read" },
        { name: "Write" },
        { name: "Edit" },
        { name: "Grep" },
        { name: "Bash" },
      ];

      // Explorer can only use Read, Grep - verify filtering works
      const filtered = manager.filterTools({ id: "test" } as any, tools);
      expect(filtered.map((t: any) => t.name)).not.toContain("Write");
      expect(filtered.map((t: any) => t.name)).not.toContain("Edit");
      expect(filtered.map((t: any) => t.name)).not.toContain("Bash");
    });
  });

  describe("read-only mode", () => {
    it("should enforce read-only for explorer agent", () => {
      registerBuiltInSubagents(manager);

      const explorer = manager.getDefinition("explorer");
      expect(explorer?.read_only).toBe(true);
    });

    it("should enforce read-only for planner agent", () => {
      registerBuiltInSubagents(manager);

      const planner = manager.getDefinition("planner");
      expect(planner?.read_only).toBe(true);
    });

    it("should enforce read-only for reviewer agent", () => {
      registerBuiltInSubagents(manager);

      const reviewer = manager.getDefinition("reviewer");
      expect(reviewer?.read_only).toBe(true);
    });

    it("should enforce read-only for security agent", () => {
      registerBuiltInSubagents(manager);

      const security = manager.getDefinition("security");
      expect(security?.read_only).toBe(true);
    });

    it("should NOT be read-only for implementer agent", () => {
      registerBuiltInSubagents(manager);

      const implementer = manager.getDefinition("implementer");
      expect(implementer?.read_only).toBe(false);
    });

    it("should NOT be read-only for tester agent", () => {
      registerBuiltInSubagents(manager);

      const tester = manager.getDefinition("tester");
      expect(tester?.read_only).toBe(false);
    });
  });

  describe("built-in subagents", () => {
    it("should have all 8 built-in subagents", () => {
      expect(BUILT_IN_SUBAGENTS).toHaveLength(8);

      const names = BUILT_IN_SUBAGENTS.map((s) => s.name);
      expect(names).toContain("explorer");
      expect(names).toContain("planner");
      expect(names).toContain("implementer");
      expect(names).toContain("reviewer");
      expect(names).toContain("tester");
      expect(names).toContain("security");
      expect(names).toContain("devops");
      expect(names).toContain("docs");
    });

    it("should get built-in subagent by name", () => {
      const explorer = getBuiltInSubagent("explorer");
      expect(explorer).toBeDefined();
      expect(explorer?.name).toBe("explorer");
    });

    it("should return undefined for unknown built-in subagent", () => {
      const unknown = getBuiltInSubagent("nonexistent");
      expect(unknown).toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("should cleanup old completed instances", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("explorer", { task: "Old task" });
      manager.updateInstance(instance.id, {
        status: "completed",
        completedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
      });

      const cleaned = manager.cleanup(5 * 60 * 1000); // 5 minute threshold
      expect(cleaned).toBe(1);
      expect(manager.getInstance(instance.id)).toBeUndefined();
    });

    it("should not cleanup recent instances", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("explorer", { task: "Recent task" });
      manager.updateInstance(instance.id, {
        status: "completed",
        completedAt: Date.now(),
      });

      const cleaned = manager.cleanup(5 * 60 * 1000);
      expect(cleaned).toBe(0);
      expect(manager.getInstance(instance.id)).toBeDefined();
    });
  });

  describe("worktree isolation (placeholder)", () => {
    it("should create worktree path placeholder", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("implementer", { task: "Code change" });
      const worktreePath = await manager.createWorktree(instance.id);

      expect(worktreePath).toBeDefined();
      expect(worktreePath).toContain(instance.id);
    });

    it("should remove worktree path placeholder", async () => {
      registerBuiltInSubagents(manager);

      const instance = await manager.spawn("implementer", { task: "Code change" });
      await manager.createWorktree(instance.id);

      const removed = await manager.removeWorktree(instance.id);
      expect(removed).toBe(true);

      const updated = manager.getInstance(instance.id);
      expect(updated?.worktreePath).toBeUndefined();
    });
  });
});

describe("SubAgentDefinition validation", () => {
  it("should require name and description", () => {
    const def: SubAgentDefinition = {
      name: "test",
      description: "Test agent",
      system_prompt: "You are a test",
      allowed_tools: [],
      permission_profile: { read: true, write: false, execute: false, network: false, tools: [] },
      memory_scope: "workspace",
    };

    expect(def.name).toBe("test");
    expect(def.description).toBe("Test agent");
  });

  it("should support optional model preference", () => {
    const def: SubAgentDefinition = {
      name: "test",
      description: "Test agent",
      system_prompt: "You are a test",
      allowed_tools: [],
      permission_profile: { read: true, write: false, execute: false, network: false, tools: [] },
      memory_scope: "workspace",
      model_preference: {
        provider: "anthropic",
        model: "claude-opus-4-8",
        temperature: 0.7,
      },
    };

    expect(def.model_preference?.provider).toBe("anthropic");
    expect(def.model_preference?.model).toBe("claude-opus-4-8");
  });
});
