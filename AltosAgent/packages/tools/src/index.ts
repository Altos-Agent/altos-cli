// @altos/tools - Native tool registry and built-in tools

// Re-export security utilities
export {
  maskSecrets,
  isProtectedPath,
  isDangerousCommand,
  normalizePath,
  isPathTraversal,
  validatePath,
  validateBashCommand,
  redactEnv,
  truncateOutput,
  createOutputSummary,
  DEFAULT_SECRET_PATTERNS,
  PROTECTED_PATH_PATTERNS,
  DANGEROUS_COMMANDS,
} from "./security.js";

// Import factory functions for use in createAllTools
import { createAllFSTools } from "./fs/index.js";
import { createAllGitTools } from "./git/index.js";
import { createAllSearchTools } from "./search/index.js";
import { createBashTool } from "./shell/index.js";

export type {
  PathValidationResult,
  CommandValidationResult,
} from "./security.js";

// ============================================================================
// Tool Definition Types
// ============================================================================

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ToolParameterProperty {
  type: "string" | "number" | "boolean" | "object" | "array" | "null";
  description?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: ToolParameterProperty;
  additionalProperties?: boolean;
  nullable?: boolean;
  properties?: Record<string, ToolParameterProperty>;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
}

export interface ToolOutputSchema {
  type: "object";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  description?: string;
}

export interface ToolPermission {
  type: "read" | "write" | "execute" | "network";
  path?: string;
  pattern?: string;
  reason?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  outputSchema: ToolOutputSchema;
  riskLevel: RiskLevel;
  requiredPermissions: ToolPermission[];
  execute(params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  cwd: string;
  workspaceRoot?: string;
  emitEvent?: (event: ToolEvent) => void;
  truncateOutput?: boolean;
  maxOutputBytes?: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
  truncated?: boolean;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export type ToolEvent =
  | { type: "tool_executing"; tool: string; params: Record<string, unknown> }
  | { type: "tool_completed"; tool: string; duration: number; outputSize: number }
  | { type: "tool_failed"; tool: string; error: string; duration: number }
  | { type: "tool_truncated"; tool: string; originalSize: number; truncatedSize: number };

// ============================================================================
// Tool Registry
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private workspaceRoots: Set<string> = new Set();

  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listToolsByRisk(risk: RiskLevel): ToolDefinition[] {
    return this.listTools().filter((t) => t.riskLevel === risk);
  }

  listToolsByPermission(permission: ToolPermission["type"]): ToolDefinition[] {
    return this.listTools().filter((t) => t.requiredPermissions.some((p) => p.type === permission));
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  getToolCount(): number {
    return this.tools.size;
  }

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots.clear();
    for (const root of roots) this.workspaceRoots.add(root);
  }

  addWorkspaceRoot(root: string): void {
    this.workspaceRoots.add(root);
  }

  getWorkspaceRoots(): string[] {
    return Array.from(this.workspaceRoots);
  }

  isPathInWorkspace(path: string): boolean {
    if (this.workspaceRoots.size === 0) return true;
    const normalized = path.replace(/\\/g, "/");
    for (const root of this.workspaceRoots) {
      const normalizedRoot = root.replace(/\\/g, "/");
      if (normalized.startsWith(normalizedRoot + "/") || normalized === normalizedRoot) {
        return true;
      }
    }
    return false;
  }

  static createDefault(): ToolRegistry {
    const registry = new ToolRegistry();
    registry.setWorkspaceRoots([process.cwd()]);
    return registry;
  }
}

// ============================================================================
// createAllTools - Register all native tools with a registry
// ============================================================================

// Re-export factory functions
export {
  createAllFSTools,
  createReadFileTool,
  createWriteFileTool,
  createEditFileTool,
  createApplyPatchTool,
  createListDirTool,
} from "./fs/index.js";
export {
  createAllGitTools,
  createGitStatusTool,
  createGitDiffTool,
  createGitLogTool,
} from "./git/index.js";
export { createAllSearchTools, createGrepTool, createFindFilesTool } from "./search/index.js";
export { createBashTool, type BashConfig } from "./shell/index.js";

// Agent tools
export {
  createSpawnAgentTool,
  createListAgentsTool,
  createGetAgentResultTool,
  createTerminateAgentTool,
  createAllAgentTools,
} from "./agent.js";

export function createAllTools(workspaceRoots?: string[]): ToolRegistry {
  const roots = workspaceRoots ?? [process.cwd()];
  const registry = new ToolRegistry();
  registry.setWorkspaceRoots(roots);

  const allFactories = [
    createAllFSTools(roots),
    createAllGitTools(roots),
    createAllSearchTools(roots),
  ];

  for (const tool of allFactories.flat()) {
    registry.registerTool(tool);
  }

  // Register bash with stricter defaults
  const bashTool = createBashTool({
    workspaceRoots: roots,
    allowDangerousByDefault: false,
    maxOutputBytes: 10 * 1024 * 1024,
  });
  registry.registerTool(bashTool);

  return registry;
}

// Alias for backward compatibility
export { ToolRegistry as default };
