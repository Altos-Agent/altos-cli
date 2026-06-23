// @altos/mcp - MCP protocol types and schemas

import type { ToolDefinition } from "@altos/tools";

// =============================================================================
// MCP Server Config
// =============================================================================

/**
 * MCP server configuration for ~/.altos/mcp.json and project .altos/mcp.json
 */
export interface MCPConfig {
  /** MCP servers to connect to */
  servers?: MCPServerConfig[];
  /** Project-specific servers override */
  projects?: MCPProjectConfig[];
}

/**
 * An MCP server to connect to
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string;
  /** Display name */
  name: string;
  /** Command to run (stdio transport) */
  command: string;
  /** Arguments to the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether this server is enabled */
  enabled?: boolean;
  /** Permissions to auto-grant */
  autoGrant?: PermissionGrant[];
  /** Dangerous server (requires confirmation) */
  dangerous?: boolean;
}

/**
 * Project-specific MCP server config
 */
export interface MCPProjectConfig {
  /** Path to the project (defaults to cwd) */
  projectPath?: string;
  /** Servers to use for this project */
  servers?: MCPServerConfig[];
}

/**
 * Permission grant for an MCP server
 */
export interface PermissionGrant {
  /** Tool name pattern (e.g., "github.*", "*") */
  tool: string;
  /** Permission type */
  permission: "read" | "write" | "execute" | "network";
  /** Optional reason */
  reason?: string;
}

// =============================================================================
// MCP Protocol Types (JSON-RPC 2.0)
// =============================================================================

/**
 * Standard JSON-RPC 2.0 message
 */
export interface MCPJsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: MCPError;
}

/**
 * MCP error object
 */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Initialize request parameters
 */
export interface MCPInitializeParams {
  protocolVersion: string;
  clientInfo: MCPClientInfo;
  capabilities: MCPServerCapabilities;
}

/**
 * Client information
 */
export interface MCPClientInfo {
  name: string;
  version: string;
}

/**
 * Server capabilities
 */
export interface MCPServerCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
}

/**
 * Server notification capabilities
 */
export interface MCPServerNotification {
  method: string;
  params?: Record<string, unknown>;
}

// =============================================================================
// MCP Protocol Results
// =============================================================================

/**
 * Initialize result
 */
export interface MCPInitializeResult {
  protocolVersion: string;
  serverInfo: MCPClientInfo;
  capabilities: MCPServerCapabilities;
  instructions?: string;
}

/**
 * List tools result
 */
export interface MCPListToolsResult {
  tools: MCPTool[];
}

/**
 * Call tool result
 */
export interface CMPCallToolResult {
  content: MCPContent[];
  isError?: boolean;
}

/**
 * MCP content block
 */
export type MCPContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: MCPResource };

/**
 * MCP resource
 */
export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * A tool from the MCP server
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: MCPToolInputSchema;
}

/**
 * JSON Schema for tool input
 */
export interface MCPToolInputSchema {
  type: "object";
  properties?: Record<string, MCPToolProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * A property in a tool's input schema
 */
export interface MCPToolProperty {
  type: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: MCPToolProperty;
  additionalProperties?: boolean;
}

// =============================================================================
// MCP Client Types
// =============================================================================

/**
 * Connection state for an MCP client
 */
export type MCPClientState = "disconnected" | "connecting" | "connected" | "error";

/**
 * A connected MCP server and its metadata
 */
export interface MCPConnectedServer {
  /** Server config ID */
  id: string;
  /** Server display name */
  name: string;
  /** Current state */
  state: MCPClientState;
  /** Protocol version */
  protocolVersion?: string;
  /** Available tools */
  tools: MCPTool[];
  /** Available resources */
  resources: MCPResource[];
  /** Error message if state is error */
  error?: string;
  /** When connected */
  connectedAt?: number;
}

/**
 * MCP tool wrapped as an Altos tool
 */
export interface MCPToolWrapper {
  /** Namespaced tool name (e.g., mcp.github.create_issue) */
  namespacedName: string;
  /** Original MCP server ID */
  serverId: string;
  /** Original tool definition */
  mcpTool: MCPTool;
  /** Altos tool definition */
  toolDefinition: ToolDefinition;
  /** Required permission level */
  requiredPermission: "read" | "write" | "execute" | "network";
  /** Whether this is a write operation */
  isWrite: boolean;
}

// =============================================================================
// MCP Server (Altos as MCP Server)
// =============================================================================

/**
 * Tool to expose through MCP server
 */
export interface MCPExposedTool {
  /** Tool name (without prefix) */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: Record<string, unknown>;
  /** Whether tool is read-only */
  readOnly: boolean;
}

// =============================================================================
// Permission Types
// =============================================================================

/**
 * Permission request for MCP tool calls
 */
export interface MCPToolPermissionRequest {
  /** Namespaced tool name */
  toolName: string;
  /** Server ID */
  serverId: string;
  /** Original MCP tool */
  mcpTool: MCPTool;
  /** Whether this is a write operation */
  isWrite: boolean;
  /** Arguments being passed */
  arguments: Record<string, unknown>;
  /** Risk category */
  riskCategory: "read" | "write" | "execute" | "network";
}
