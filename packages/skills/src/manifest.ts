// @altos/skills - Skill manifest definition

/**
 * A skill manifest describes a skill's metadata, requirements, and behavior
 * without coupling to a specific runtime implementation.
 */
export interface SkillManifest {
  /** Unique name, e.g. "code-review" */
  name: string;
  /** Semantic version, e.g. "1.0.0" */
  version: string;
  /** Human-readable description */
  description: string;
  /**
   * Instruction text/prompt injected into the agent when this skill is invoked.
   * This is the core of what the skill does — it guides agent behavior.
   */
  instructions: string;
  /**
   * Tools this skill requires to function.
   * The skill loader validates these are available before running.
   */
  required_tools?: string[];
  /**
   * Permissions this skill requires.
   * Declared so users can review what the skill needs.
   */
  required_permissions?: PermissionRef[];
  /**
   * Optional memory keys this skill may read/write.
   * Format: "memory-key" for read-write, "memory-key?" for read-only.
   */
  optional_memory?: string[];
  /**
   * Example inputs and expected behavior.
   * Used for documentation, testing, and the `altos skill inspect` command.
   */
  examples?: SkillExample[];
  /** Aliases that can trigger this skill */
  triggers?: string[];
  /** Hidden skills are not shown in `altos skill list` */
  hidden?: boolean;
}

export interface PermissionRef {
  scope: string;
  reason?: string;
}

export interface SkillExample {
  description: string;
  input: string;
  expected?: string;
}
