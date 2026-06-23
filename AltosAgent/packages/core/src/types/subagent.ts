// @altos/core - Subagent types

/**
 * Memory scope for a subagent - determines what memory context it can access
 */
export type MemoryScope =
  | "none" // No memory access
  | "session" // Current session only
  | "workspace" // Current workspace/project
  | "global"; // All memory (admin only)

/**
 * Permission profile for a subagent - defines what operations are allowed
 */
export interface PermissionProfile {
  read: boolean;
  write: boolean;
  execute: boolean;
  network: boolean;
  tools: string[]; // Whitelist of specific tool names allowed
  paths?: string[]; // Allowed path patterns (e.g., "src/**", "docs/**")
}

/**
 * Model preference for a subagent
 */
export interface ModelPreference {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Subagent definition - describes a spawnable subagent type
 */
export interface SubAgentDefinition {
  name: string;
  description: string;
  system_prompt: string;
  allowed_tools: string[];
  permission_profile: PermissionProfile;
  memory_scope: MemoryScope;
  model_preference?: ModelPreference;
  read_only?: boolean; // If true, write tools are stripped regardless
}

/**
 * Result from a subagent execution
 */
export interface SubAgentResult {
  success: boolean;
  output: string;
  artifacts: SubAgentArtifact[];
  summary: string;
  durationMs: number;
  error?: string;
}

/**
 * Artifact produced by a subagent
 */
export interface SubAgentArtifact {
  type: "code" | "test" | "findings" | "diff" | "report" | "plan";
  path: string;
  content?: string;
  description?: string;
}

/**
 * Subagent instance state
 */
export interface SubAgentInstance {
  id: string;
  definition: SubAgentDefinition;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  result?: SubAgentResult;
  worktreePath?: string; // For future worktree isolation
}

/**
 * Spawn options for creating a subagent
 */
export interface SpawnOptions {
  task: string;
  context?: {
    cwd?: string;
    artifacts?: string[];
    parentSessionId?: string;
  };
  overrides?: Partial<SubAgentDefinition>;
}
