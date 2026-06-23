// @altos/core - SubAgentManager

import { randomUUID } from "crypto";
import type {
  SubAgentDefinition,
  SubAgentResult,
  SubAgentInstance,
  SpawnOptions,
} from "../types/subagent.js";
import { createLogger, type Logger } from "../index.js";

/**
 * SubAgentManager - manages lifecycle of subagents
 *
 * Responsibilities:
 * - Registry of available subagent definitions
 * - Spawning new subagent instances
 * - Tracking running subagents
 * - Collecting results from completed subagents
 * - Worktree isolation (placeholder for future)
 */
export class SubAgentManager {
  private definitions: Map<string, SubAgentDefinition> = new Map();
  private instances: Map<string, SubAgentInstance> = new Map();
  private logger: Logger;

  constructor(options?: { leadSessionId?: string; logger?: Logger }) {
    this.logger = options?.logger ?? createLogger("SubAgentManager");
  }

  /**
   * Register a subagent definition
   */
  register(definition: SubAgentDefinition): void {
    if (this.definitions.has(definition.name)) {
      this.logger.warn(`Subagent definition '${definition.name}' already registered, overwriting`);
    }
    this.definitions.set(definition.name, definition);
    this.logger.info(`Registered subagent: ${definition.name}`);
  }

  /**
   * Register multiple subagent definitions at once
   */
  registerMany(definitions: SubAgentDefinition[]): void {
    for (const def of definitions) {
      this.register(def);
    }
  }

  /**
   * Get a subagent definition by name
   */
  getDefinition(name: string): SubAgentDefinition | undefined {
    return this.definitions.get(name);
  }

  /**
   * List all registered subagent names
   */
  listDefinitions(): string[] {
    return Array.from(this.definitions.keys());
  }

  /**
   * Get all registered subagent definitions
   */
  getAllDefinitions(): SubAgentDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Spawn a new subagent instance
   */
  async spawn(name: string, options: SpawnOptions): Promise<SubAgentInstance> {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`Unknown subagent: ${name}. Available: ${this.listDefinitions().join(", ")}`);
    }

    // Merge definition with any overrides
    const effectiveDefinition: SubAgentDefinition = {
      ...definition,
      ...options.overrides,
      allowed_tools: options.overrides?.allowed_tools ?? definition.allowed_tools,
      permission_profile: options.overrides?.permission_profile ?? definition.permission_profile,
    };

    // Create instance
    const instance: SubAgentInstance = {
      id: randomUUID(),
      definition: effectiveDefinition,
      status: "pending",
      startedAt: Date.now(),
    };

    this.instances.set(instance.id, instance);
    this.logger.info(`Spawned subagent '${name}' with id ${instance.id}`);

    return instance;
  }

  /**
   * Update subagent instance status and result
   */
  updateInstance(
    id: string,
    updates: Partial<Pick<SubAgentInstance, "status" | "result" | "completedAt" | "worktreePath">>,
  ): void {
    const instance = this.instances.get(id);
    if (!instance) {
      this.logger.warn(`Attempted to update unknown subagent instance: ${id}`);
      return;
    }

    if (updates.status) instance.status = updates.status;
    if (updates.result) instance.result = updates.result;
    if (updates.completedAt) instance.completedAt = updates.completedAt;
    if (updates.worktreePath) instance.worktreePath = updates.worktreePath;
  }

  /**
   * Get a subagent instance by ID
   */
  getInstance(id: string): SubAgentInstance | undefined {
    return this.instances.get(id);
  }

  /**
   * List all running subagent instances
   */
  listRunningInstances(): SubAgentInstance[] {
    return Array.from(this.instances.values()).filter(
      (inst) => inst.status === "running" || inst.status === "pending",
    );
  }

  /**
   * List all subagent instances
   */
  listAllInstances(): SubAgentInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Terminate a running subagent
   */
  terminate(id: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) {
      this.logger.warn(`Attempted to terminate unknown subagent: ${id}`);
      return false;
    }

    if (
      instance.status === "completed" ||
      instance.status === "failed" ||
      instance.status === "cancelled"
    ) {
      this.logger.info(`Subagent ${id} already terminated with status: ${instance.status}`);
      return true;
    }

    instance.status = "cancelled";
    instance.completedAt = Date.now();
    this.logger.info(`Terminated subagent: ${id}`);
    return true;
  }

  /**
   * Collect results from all completed subagents for the lead session
   */
  collectResults(): SubAgentResult[] {
    const results: SubAgentResult[] = [];
    for (const instance of this.instances.values()) {
      if (instance.result) {
        results.push(instance.result);
      }
    }
    return results;
  }

  /**
   * Get results from subagents since a given timestamp
   */
  getResultsSince(timestamp: number): SubAgentResult[] {
    return Array.from(this.instances.values())
      .filter((inst) => inst.completedAt && inst.completedAt > timestamp && inst.result)
      .map((inst) => inst.result!);
  }

  /**
   * Create a worktree for future parallel code edits (placeholder)
   *
   * This is a placeholder for future worktree isolation support.
   * When implemented, this will create an isolated git worktree for
   * subagent code edits to prevent conflicts.
   */
  async createWorktree(instanceId: string, _branchName?: string): Promise<string | null> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      this.logger.warn(`Cannot create worktree for unknown instance: ${instanceId}`);
      return null;
    }

    // Placeholder - in the future this will call git worktree add
    const worktreePath = `/tmp/altos-worktree-${instanceId}`;
    this.logger.info(`[PLACEHOLDER] Would create worktree at: ${worktreePath}`);

    // Mark as having a worktree (even though we didn't actually create it)
    instance.worktreePath = worktreePath;

    return worktreePath;
  }

  /**
   * Remove a worktree (placeholder)
   */
  async removeWorktree(instanceId: string): Promise<boolean> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return false;
    }

    // Placeholder
    this.logger.info(`[PLACEHOLDER] Would remove worktree for instance: ${instanceId}`);
    instance.worktreePath = undefined;
    return true;
  }

  /**
   * Check if a subagent has permission to use a specific tool
   */
  canUseTool(instanceId: string, toolName: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    const { allowed_tools, read_only } = instance.definition;

    // Read-only agents cannot use write/edit tools
    if (read_only) {
      const writeTools = ["Write", "Edit", "Bash"];
      if (writeTools.some((wt) => toolName.includes(wt))) {
        return false;
      }
    }

    // Check tool whitelist
    if (allowed_tools.length > 0 && !allowed_tools.includes("*")) {
      return allowed_tools.includes(toolName);
    }

    return true;
  }

  /**
   * Filter tools based on subagent permissions
   */
  filterTools<T extends { name: string }>(instanceId: string, tools: T[]): T[] {
    return tools.filter((tool) => this.canUseTool(instanceId, tool.name));
  }

  /**
   * Cleanup completed/failed instances older than given age
   */
  cleanup(olderThanMs: number = 5 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs;
    let cleaned = 0;

    for (const [id, instance] of this.instances.entries()) {
      if (instance.completedAt && instance.completedAt < cutoff) {
        this.instances.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info(`Cleaned up ${cleaned} old subagent instances`);
    }

    return cleaned;
  }
}

// Export a singleton instance getter for convenience
let managerInstance: SubAgentManager | null = null;

export function getSubAgentManager(): SubAgentManager {
  if (!managerInstance) {
    managerInstance = new SubAgentManager();
  }
  return managerInstance;
}

export function setSubAgentManager(manager: SubAgentManager): void {
  managerInstance = manager;
}
