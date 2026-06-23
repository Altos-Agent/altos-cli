// @altos/tools - Subagent spawn tool

import type { SubAgentResult, SpawnOptions } from "@altos/core";
import { SubAgentManager } from "@altos/core";
import type { ToolDefinition, ToolContext, ToolResult } from "./index.js";

// Singleton manager for spawn_agent tool
let toolManager: SubAgentManager | null = null;

function getToolManager(): SubAgentManager {
  if (!toolManager) {
    toolManager = new SubAgentManager();
    // registerBuiltInSubagents would be called here when implemented
  }
  return toolManager;
}

/**
 * Create the spawn_agent tool
 *
 * This tool allows the lead agent to spawn subagents with:
 * - Restricted tool sets based on subagent type
 * - Read-only mode enforcement for sensitive agents
 * - Memory scope restrictions
 * - Structured result reporting back to lead session
 */
export function createSpawnAgentTool(): ToolDefinition {
  return {
    name: "spawn_agent",
    description:
      "Spawn a specialized subagent to perform a specific task. The subagent runs with restricted permissions and reports results back to the lead session.",
    inputSchema: {
      type: "object",
      properties: {
        agent_name: {
          type: "string",
          description:
            "Name of the subagent to spawn (explorer, planner, implementer, reviewer, tester, security, devops, docs)",
          enum: [
            "explorer",
            "planner",
            "implementer",
            "reviewer",
            "tester",
            "security",
            "devops",
            "docs",
          ],
        },
        task: {
          type: "string",
          description: "The task to give the subagent",
        },
        context: {
          type: "object",
          description: "Optional context for the subagent",
          properties: {
            cwd: {
              type: "string",
              description: "Working directory for the subagent",
            },
            parent_session_id: {
              type: "string",
              description: "Parent session ID for result reporting",
            },
          },
        },
        overrides: {
          type: "object",
          description: "Optional overrides for the subagent definition",
          properties: {
            allowed_tools: {
              type: "array",
              items: { type: "string" },
              description: "Override the allowed tools list",
            },
            read_only: {
              type: "boolean",
              description: "Override read-only mode",
            },
          },
        },
      },
      required: ["agent_name", "task"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        instance_id: { type: "string" },
        agent_name: { type: "string" },
        status: { type: "string" },
        message: { type: "string" },
        result: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            output: { type: "string" },
            summary: { type: "string" },
            duration_ms: { type: "number" },
            artifacts: { type: "array" },
          },
        },
      },
    },
    riskLevel: "medium",
    requiredPermissions: [
      { type: "read", reason: "Spawning subagents requires read access to check workspace state" },
    ],
    execute: async (
      params: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      const startTime = Date.now();
      const manager = getToolManager();

      const agentName = params.agent_name as string;
      const task = params.task as string;
      const context = params.context as SpawnOptions["context"] | undefined;
      const overrides = params.overrides as SpawnOptions["overrides"] | undefined;

      // Validate agent exists
      const definition = manager.getDefinition(agentName);
      if (!definition) {
        return {
          success: false,
          error: `Unknown subagent: ${agentName}. Available: ${manager.listDefinitions().join(", ")}`,
          duration: Date.now() - startTime,
        };
      }

      // Apply read-only enforcement from definition
      const effectiveReadOnly = overrides?.read_only ?? definition.read_only ?? false;

      try {
        // Spawn the subagent
        const instance = await manager.spawn(agentName, {
          task,
          context: {
            cwd: context?.cwd ?? process.cwd(),
            parentSessionId: context?.parentSessionId,
          },
          overrides: {
            ...overrides,
            read_only: effectiveReadOnly,
          },
        });

        // For now, we just return the spawned instance info
        // Full subagent execution would happen asynchronously
        const result: SubAgentResult = {
          success: true,
          output: `Subagent '${agentName}' spawned with ID: ${instance.id}`,
          artifacts: [],
          summary: `Spawned ${agentName} subagent to execute: ${task.slice(0, 100)}${task.length > 100 ? "..." : ""}`,
          durationMs: Date.now() - startTime,
        };

        // Update instance with simulated result (in real impl, this would come from actual execution)
        manager.updateInstance(instance.id, {
          status: "completed",
          result,
          completedAt: Date.now(),
        });

        return {
          success: true,
          data: {
            success: true,
            instance_id: instance.id,
            agent_name: agentName,
            status: instance.status,
            message: `Subagent '${agentName}' spawned and tracked`,
            result: {
              success: result.success,
              output: result.output,
              summary: result.summary,
              duration_ms: result.durationMs,
              artifacts: result.artifacts,
            },
          },
          duration: Date.now() - startTime,
          summary: `Spawned ${agentName} subagent: ${instance.id}`,
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to spawn subagent: ${err instanceof Error ? err.message : String(err)}`,
          duration: Date.now() - startTime,
        };
      }
    },
  };
}

/**
 * Create the list_agents tool - lists available subagents
 */
export function createListAgentsTool(): ToolDefinition {
  return {
    name: "list_agents",
    description: "List all available subagent types with their descriptions and capabilities",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Optional filter to match agent names",
        },
        read_only_only: {
          type: "boolean",
          description: "If true, only show read-only agents",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        agents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              read_only: { type: "boolean" },
              memory_scope: { type: "string" },
              tools_count: { type: "number" },
            },
          },
        },
        total: { type: "number" },
      },
    },
    riskLevel: "low",
    requiredPermissions: [],
    execute: async (
      params: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      const manager = getToolManager();
      let agents = manager.getAllDefinitions();

      // Apply filters
      if (params.filter) {
        const filter = (params.filter as string).toLowerCase();
        agents = agents.filter(
          (a) =>
            a.name.toLowerCase().includes(filter) || a.description.toLowerCase().includes(filter),
        );
      }

      if (params.read_only_only) {
        agents = agents.filter((a) => a.read_only);
      }

      return {
        success: true,
        data: {
          agents: agents.map((a) => ({
            name: a.name,
            description: a.description,
            read_only: a.read_only ?? false,
            memory_scope: a.memory_scope,
            tools_count: a.allowed_tools.length,
          })),
          total: agents.length,
        },
        duration: 0,
      };
    },
  };
}

/**
 * Create the get_agent_result tool - retrieves results from a spawned subagent
 */
export function createGetAgentResultTool(): ToolDefinition {
  return {
    name: "get_agent_result",
    description: "Get the result from a previously spawned subagent instance",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: {
          type: "string",
          description: "The instance ID returned from spawn_agent",
        },
      },
      required: ["instance_id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        found: { type: "boolean" },
        instance_id: { type: "string" },
        status: { type: "string" },
        result: {
          type: "object",
          nullable: true,
          properties: {
            success: { type: "boolean" },
            output: { type: "string" },
            summary: { type: "string" },
            duration_ms: { type: "number" },
            error: { type: "string" },
            artifacts: { type: "array" },
          },
        },
      },
    },
    riskLevel: "low",
    requiredPermissions: [],
    execute: async (
      params: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      const manager = getToolManager();
      const instanceId = params.instance_id as string;

      const instance = manager.getInstance(instanceId);
      if (!instance) {
        return {
          success: true,
          data: {
            found: false,
            instance_id: instanceId,
            status: "unknown",
            result: null,
          },
          duration: 0,
        };
      }

      return {
        success: true,
        data: {
          found: true,
          instance_id: instance.id,
          status: instance.status,
          result: instance.result
            ? {
                success: instance.result.success,
                output: instance.result.output,
                summary: instance.result.summary,
                duration_ms: instance.result.durationMs,
                error: instance.result.error,
                artifacts: instance.result.artifacts,
              }
            : null,
        },
        duration: 0,
      };
    },
  };
}

/**
 * Create the terminate_agent tool - cancel a running subagent
 */
export function createTerminateAgentTool(): ToolDefinition {
  return {
    name: "terminate_agent",
    description: "Terminate a running subagent instance",
    inputSchema: {
      type: "object",
      properties: {
        instance_id: {
          type: "string",
          description: "The instance ID of the subagent to terminate",
        },
      },
      required: ["instance_id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        instance_id: { type: "string" },
        message: { type: "string" },
      },
    },
    riskLevel: "medium",
    requiredPermissions: [
      { type: "execute", reason: "Terminating a subagent requires execute permission" },
    ],
    execute: async (
      params: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> => {
      const manager = getToolManager();
      const instanceId = params.instance_id as string;

      const terminated = manager.terminate(instanceId);
      if (!terminated) {
        return {
          success: false,
          error: `Failed to terminate subagent: ${instanceId}`,
          duration: 0,
        };
      }

      return {
        success: true,
        data: {
          success: true,
          instance_id: instanceId,
          message: `Subagent ${instanceId} terminated`,
        },
        duration: 0,
      };
    },
  };
}

/**
 * Create all agent-related tools
 */
export function createAllAgentTools(): ToolDefinition[] {
  return [
    createSpawnAgentTool(),
    createListAgentsTool(),
    createGetAgentResultTool(),
    createTerminateAgentTool(),
  ];
}
