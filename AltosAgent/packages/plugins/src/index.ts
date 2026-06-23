// @altos/plugins - Plugin system types and core interfaces

import type { ToolDefinition } from "@altos/tools";
import type { MemoryProvider } from "@altos/memory";

// Re-export from sub-modules for convenience
export { createPluginManager, getGlobalPluginManager } from "./manager/index.js";
export { discoverPlugins, getLocalPluginPath, getGlobalPluginPath } from "./loader/index.js";
export {
  validatePluginPermissions,
  getPluginGrants,
  grantPluginPermissions,
  denyPluginPermissions,
  revokePluginPermissions,
} from "./permissions/index.js";

// =============================================================================
// Plugin Manifest
// =============================================================================

/**
 * Permission scope for plugins.
 * Plugins declare the permissions they need; the system validates against
 * what the user has granted.
 */
export type PermissionScope =
  // File system
  | "fs:read"
  | "fs:read:paths"
  | "fs:write"
  | "fs:write:paths"
  | "fs:exec"
  // Network
  | "net:connect"
  | "net:listen"
  // Tools & hooks
  | "tool:*"
  | "tool:register"
  | "hook:*"
  | "hook:session_start"
  | "hook:user_prompt"
  | "hook:before_model_call"
  | "hook:after_model_call"
  | "hook:before_tool_call"
  | "hook:after_tool_call"
  | "hook:before_file_write"
  | "hook:after_file_write"
  | "hook:before_compact"
  | "hook:session_end"
  // Memory
  | "memory:*"
  | "memory:read"
  | "memory:write"
  | "memory:search"
  // Model
  | "model:*"
  | "model:register"
  | "model:call"
  // MCP
  | "mcp:*"
  | "mcp:register"
  | "mcp:server"
  // Skills
  | "skill:*"
  | "skill:register"
  // Config
  | "config:read"
  | "config:write";

/**
 * A permission entry in the plugin manifest.
 */
export interface PluginPermission {
  scope: PermissionScope;
  paths?: string[]; // For fs:read:paths, fs:write:paths
  reason?: string; // Human-readable justification
}

/**
 * Tool registration from plugin manifest.
 */
export interface PluginToolSpec {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  riskLevel?: "low" | "medium" | "high" | "critical";
  permissions?: PluginPermission[];
}

/**
 * Command registration from plugin manifest.
 */
export interface PluginCommandSpec {
  name: string;
  description?: string;
  handler: string; // Path to handler function "module.handler"
}

/**
 * Hook event registration from plugin manifest.
 */
export interface PluginHookSpec {
  event: HookEventType;
  handler: string; // Path to handler function "module.handler"
}

/**
 * Memory provider registration from plugin manifest.
 */
export interface PluginMemoryProviderSpec {
  id: string;
  name: string;
  initialize: string; // Path to initialize function
}

/**
 * Model provider registration from plugin manifest.
 */
export interface PluginModelProviderSpec {
  id: string;
  name: string;
  adapter: string; // Path to model adapter module
}

/**
 * MCP server registration from plugin manifest.
 */
export interface PluginMcpServerSpec {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * Skill registration from plugin manifest.
 */
export interface PluginSkillSpec {
  name: string;
  description?: string;
  path: string; // Path to skill module
}

/**
 * Plugin manifest — the metadata file for a plugin package.
 */
export interface PluginManifest {
  /** Unique name (kebab-case) */
  name: string;
  /** Semantic version */
  version: string;
  /** Short description */
  description?: string;
  /** Entry module path (relative to package root) */
  entry: string;
  /** Optional dependencies on other plugins */
  dependencies?: string[];
  /** Permissions this plugin requests */
  permissions?: PluginPermission[];
  /** Tools this plugin registers */
  tools?: PluginToolSpec[];
  /** Slash commands this plugin registers */
  commands?: PluginCommandSpec[];
  /** Hooks this plugin registers */
  hooks?: PluginHookSpec[];
  /** Memory providers this plugin registers */
  memory_providers?: PluginMemoryProviderSpec[];
  /** Model providers this plugin registers */
  model_providers?: PluginModelProviderSpec[];
  /** MCP servers this plugin registers */
  mcp_servers?: PluginMcpServerSpec[];
  /** Skills this plugin registers */
  skills?: PluginSkillSpec[];
}

// =============================================================================
// Hook Events
// =============================================================================

/**
 * All hook event types supported by the plugin system.
 */
export type HookEventType =
  | "session_start"
  | "user_prompt"
  | "before_model_call"
  | "after_model_call"
  | "before_tool_call"
  | "after_tool_call"
  | "before_file_write"
  | "after_file_write"
  | "before_compact"
  | "session_end";

/**
 * Context passed to hook handlers.
 */
export interface HookContext {
  /** The event type */
  event: HookEventType;
  /** Session ID when applicable */
  sessionId?: string;
  /** Arbitrary event data */
  data?: unknown;
  /** Timestamp */
  timestamp: number;
  /** Stop propagation flag — if set, subsequent handlers are skipped */
  stopPropagation?: boolean;
  /** Return value from hook handler */
  result?: unknown;
}

/**
 * A registered hook handler.
 */
export interface PluginHook {
  /** Unique name for this hook */
  name: string;
  /** The event type to hook into */
  event: HookEventType;
  /** Priority (lower = earlier; default 100) */
  priority?: number;
  /** Handler function */
  handler: (ctx: HookContext) => Promise<void> | void;
}

// =============================================================================
// Plugin API (passed to plugin init)
// =============================================================================

/**
 * The API surface exposed to plugins.
 * Plugins receive this object during initialization.
 */
export interface PluginAPI {
  /**
   * Register a tool with the runtime.
   */
  registerTool(tool: ToolDefinition): void;

  /**
   * Register a slash command with the REPL.
   */
  registerCommand(spec: PluginCommandSpec): void;

  /**
   * Register a hook handler.
   */
  registerHook(hook: PluginHook): void;

  /**
   * Register a memory provider.
   */
  registerMemoryProvider(provider: MemoryProvider): void;

  /**
   * Register a model provider adapter.
   */
  registerModelProvider(spec: PluginModelProviderSpec & { adapter: unknown }): void;

  /**
   * Register an MCP server.
   */
  registerMcpServer(spec: PluginMcpServerSpec): void;

  /**
   * Register a skill.
   */
  registerSkill(skill: PluginSkillSpec): void;

  /**
   * Read plugin config (persisted key-value store).
   */
  readConfig(key: string): unknown;

  /**
   * Write plugin config.
   */
  writeConfig(key: string, value: unknown): void;

  /**
   * Delete a config key.
   */
  deleteConfig(key: string): void;

  /**
   * Get the plugin's declared permissions.
   */
  getPermissions(): PluginPermission[];

  /**
   * Check if a permission has been granted.
   */
  hasPermission(scope: PermissionScope): boolean;

  /**
   * Logger for the plugin.
   */
  logger: {
    debug(msg: string, ...args: unknown[]): void;
    info(msg: string, ...args: unknown[]): void;
    warn(msg: string, ...args: unknown[]): void;
    error(msg: string, ...args: unknown[]): void;
  };
}

// =============================================================================
// Plugin Interface
// =============================================================================

/**
 * A loaded plugin instance.
 */
export interface Plugin {
  /** Unique name */
  name: string;
  /** Version string */
  version: string;
  /** Short description */
  description?: string;
  /** Manifest */
  manifest: PluginManifest;
  /** Initialize the plugin with the given API. */
  init(api: PluginAPI): Promise<void> | void;
  /** Clean up when plugin is unloaded. */
  dispose(): Promise<void> | void;
}

// =============================================================================
// Plugin Lifecycle States
// =============================================================================

export type PluginStatus = "discovered" | "loading" | "loaded" | "failed" | "unloaded";

/**
 * Runtime state for a loaded plugin.
 */
export interface PluginState {
  name: string;
  version: string;
  description?: string;
  status: PluginStatus;
  manifest: PluginManifest;
  instance?: Plugin;
  error?: string;
  loadedAt?: number;
}

// =============================================================================
// Permission Validation
// =============================================================================

/**
 * Result of validating a plugin manifest.
 */
export interface PermissionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  granted: PermissionScope[];
  denied: PermissionScope[];
}

/**
 * User-granted permissions overrides.
 * Stored in ~/.altos/plugin-permissions.json
 */
export interface UserPermissionGrants {
  [pluginName: string]: {
    granted: PermissionScope[];
    denied: PermissionScope[];
    grantedAt?: number;
    grantedBy?: string;
  };
}

// =============================================================================
// Plugin Discovery
// =============================================================================

/**
 * Where a plugin was discovered from.
 */
export type PluginSource = "local" | "global" | "node_modules";

/**
 * A discovered plugin before it is loaded.
 */
export interface DiscoveredPlugin {
  /** Plugin name */
  name: string;
  /** Path to plugin directory or package */
  path: string;
  /** Where it was discovered */
  source: PluginSource;
  /** Manifest if parseable */
  manifest?: PluginManifest;
  /** Error parsing manifest */
  manifestError?: string;
}

// =============================================================================
// Built-in hook event payloads
// =============================================================================

export interface SessionStartPayload {
  sessionId: string;
  cwd: string;
  model?: string;
  provider?: string;
}

export interface UserPromptPayload {
  sessionId: string;
  prompt: string;
}

export interface BeforeModelCallPayload {
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
  modelConfig: Record<string, unknown>;
}

export interface AfterModelCallPayload {
  sessionId: string;
  response: {
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
    finishReason: string;
  };
  duration: number;
}

export interface BeforeToolCallPayload {
  sessionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface AfterToolCallPayload {
  sessionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
    duration: number;
  };
}

export interface BeforeFileWritePayload {
  sessionId: string;
  filePath: string;
  content: string;
}

export interface AfterFileWritePayload {
  sessionId: string;
  filePath: string;
  bytesWritten: number;
}

export interface BeforeCompactPayload {
  sessionId: string;
  eventCount: number;
}

export interface SessionEndPayload {
  sessionId: string;
  reason?: string;
  totalEvents: number;
  duration: number;
}

export type HookPayload =
  | SessionStartPayload
  | UserPromptPayload
  | BeforeModelCallPayload
  | AfterModelCallPayload
  | BeforeToolCallPayload
  | AfterToolCallPayload
  | BeforeFileWritePayload
  | AfterFileWritePayload
  | BeforeCompactPayload
  | SessionEndPayload;
