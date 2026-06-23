// @altos/mcp - MCP Client Manager

import type { Logger } from "@altos/core";
import type { ToolDefinition } from "@altos/tools";
import { StdioTransport } from "./transport.js";
import type {
  MCPServerConfig,
  MCPConnectedServer,
  MCPToolWrapper,
  MCPTool,
  CMPCallToolResult,
} from "./types.js";
import {
  loadAllMCPConfigs,
  getServerCredentials,
  addMCPServerToConfig,
  removeMCPServerFromConfig,
  isServerDangerous,
} from "./config.js";
import type { PermissionManager, ToolPermissionRequest } from "@altos/permissions";

// =============================================================================
// MCP Client Manager
// =============================================================================

/**
 * MCP Client Manager - manages connections to MCP servers and exposes tools
 *
 * Config sources (in priority order, highest first):
 *  1. Plugin-contributed servers (via addPluginServers / PluginMcpServerSpec)
 *  2. Project config: <cwd>/.altos/mcp.json
 *  3. Global config: ~/.altos/mcp.json
 *
 * MCP tools are registered with ToolRegistry under namespaced names:
 *   mcp.<server-id>.<tool-name>
 *
 * Write operations (create, update, delete, etc.) require ask-high permission
 * via PermissionManager.requestPermission(..., askHigh=true).
 */
export class MCPClientManager {
  private servers: Map<string, MCPConnectedServer> = new Map();
  private transports: Map<string, StdioTransport> = new Map();
  private toolWrappers: Map<string, MCPToolWrapper> = new Map();
  private logger: Logger | undefined;
  private permissionManager: PermissionManager | null = null;
  private pluginServers: MCPServerConfig[] = [];
  private _toolRegistry: Map<string, ToolDefinition> = new Map();

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  /**
   * Set the permission manager for MCP tool calls.
   * Must be called before loadServers() for permission checks to work.
   */
  setPermissionManager(pm: PermissionManager): void {
    this.permissionManager = pm;
  }

  /**
   * Set an external tool registry to register MCP tools with.
   * When set, all MCP tools are registered as namespaced entries.
   */
  setToolRegistry(registry: Map<string, ToolDefinition>): void {
    this._toolRegistry = registry;
  }

  /**
   * Register MCP tools with an external ToolRegistry instance.
   * This is called automatically by the AgentRuntime when MCP is integrated.
   */
  registerToolsWithRegistry(registry: Map<string, ToolDefinition>): void {
    this._toolRegistry = registry;
    for (const wrapper of this.toolWrappers.values()) {
      registry.set(wrapper.namespacedName, wrapper.toolDefinition);
    }
  }

  /**
   * Load servers from config files and plugins
   */
  async loadServers(cwd?: string): Promise<void> {
    // Load from config files
    const { servers: configServers, errors } = loadAllMCPConfigs(cwd);

    for (const err of errors) {
      this.logger?.warn(`MCP config error: ${err}`);
    }

    // Add servers from plugins
    const allServers = [...configServers, ...this.pluginServers];

    for (const server of allServers) {
      if (server.enabled === false) continue;
      try {
        await this.connectServer(server);
      } catch (err) {
        this.logger?.error(`Failed to connect to MCP server "${server.id}": ${err}`);
        // Store in disconnected state
        this.servers.set(server.id, {
          id: server.id,
          name: server.name,
          state: "error",
          tools: [],
          resources: [],
          error: String(err),
        });
      }
    }
  }

  /**
   * Add MCP servers from plugins
   */
  addPluginServers(servers: MCPServerConfig[]): void {
    this.pluginServers.push(...servers);
  }

  /**
   * Connect to an MCP server
   */
  async connectServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.id)) {
      // Already connected
      return;
    }

    this.logger?.info(`Connecting to MCP server: ${config.id}`);

    // Update state to connecting
    this.servers.set(config.id, {
      id: config.id,
      name: config.name,
      state: "connecting",
      tools: [],
      resources: [],
    });

    // Get credentials
    const credentials = getServerCredentials(config.id);
    const env = { ...config.env, ...credentials };

    // Create transport
    const transport = new StdioTransport(config.command, config.args ?? [], env);
    this.transports.set(config.id, transport);

    try {
      // Start the process
      await transport.start();

      // Initialize
      const initResult = await transport.initialize("altos", "1.0.0");

      // List tools
      const toolsResult = await transport.listTools();

      // Update state
      this.servers.set(config.id, {
        id: config.id,
        name: config.name,
        state: "connected",
        protocolVersion: initResult.protocolVersion,
        tools: toolsResult.tools,
        resources: [],
        connectedAt: Date.now(),
      });

      // Wrap tools
      for (const tool of toolsResult.tools) {
        this.wrapTool(config.id, config.name, tool, config.autoGrant);
      }

      this.logger?.info(
        `Connected to MCP server "${config.id}" with ${toolsResult.tools.length} tools`,
      );
    } catch (err) {
      this.servers.set(config.id, {
        id: config.id,
        name: config.name,
        state: "error",
        tools: [],
        resources: [],
        error: String(err),
      });
      this.transports.delete(config.id);
      throw err;
    }
  }

  /**
   * Wrap an MCP tool as an Altos tool
   */
  private wrapTool(
    serverId: string,
    serverName: string,
    tool: MCPTool,
    autoGrant?: { tool: string; permission: string }[],
  ): void {
    const namespacedName = `mcp.${serverId}.${tool.name}`;
    const isWrite = this.isWriteOperation(tool.name);

    // Check if tool should be auto-granted
    const grant = autoGrant?.find(
      (g) =>
        g.tool === tool.name ||
        g.tool === "*" ||
        new RegExp("^" + g.tool.replace(/\*/g, ".*") + "$").test(tool.name),
    );
    const requiredPermission = grant?.permission ?? (isWrite ? "write" : "read");

    // Convert MCP schema to Altos schema
    const inputSchema = this.convertInputSchema(tool.inputSchema);

    const toolDef: ToolDefinition = {
      name: namespacedName,
      description: tool.description ?? `MCP tool: ${tool.name} from ${serverName}`,
      inputSchema,
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          content: { type: "array" },
        },
      },
      riskLevel: isWrite ? "medium" : "low",
      requiredPermissions: [
        {
          type: requiredPermission as "read" | "write" | "execute" | "network",
        },
      ],
      execute: async (args, context) => {
        return this.executeMCPTool(serverId, tool, args, context.sessionId);
      },
    };

    this.toolWrappers.set(namespacedName, {
      namespacedName,
      serverId,
      mcpTool: tool,
      toolDefinition: toolDef,
      requiredPermission: requiredPermission as "read" | "write" | "execute" | "network",
      isWrite,
    });

    // Also register with external tool registry if one is set
    this._toolRegistry.set(namespacedName, toolDef);
  }

  /**
   * Convert MCP input schema to Altos input schema
   */
  private convertInputSchema(mcpSchema: MCPTool["inputSchema"]): ToolDefinition["inputSchema"] {
    if (!mcpSchema.properties) {
      return { type: "object", properties: {} };
    }

    const properties: Record<string, import("@altos/tools").ToolParameterProperty> = {};
    for (const [key, prop] of Object.entries(mcpSchema.properties)) {
      properties[key] = {
        type: prop.type as "string" | "number" | "boolean" | "object" | "array" | "null",
        description: prop.description,
        default: prop.default,
        enum: prop.enum,
        minimum: prop.minimum,
        maximum: prop.maximum,
        minLength: prop.minLength,
        maxLength: prop.maxLength,
        pattern: prop.pattern,
      };
    }

    return {
      type: "object",
      properties,
      required: mcpSchema.required,
      additionalProperties: mcpSchema.additionalProperties,
    };
  }

  /**
   * Determine if an MCP tool is a write operation
   */
  private isWriteOperation(toolName: string): boolean {
    const writePatterns = [
      /create/i,
      /update/i,
      /edit/i,
      /delete/i,
      /remove/i,
      /add/i,
      /post/i,
      /put/i,
      /patch/i,
      /send/i,
      /submit/i,
    ];
    return writePatterns.some((p) => p.test(toolName));
  }

  /**
   * Execute an MCP tool with permission checking
   */
  async executeMCPTool(
    serverId: string,
    tool: MCPTool,
    args: Record<string, unknown>,
    sessionId?: string,
  ): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
    duration: number;
  }> {
    const startTime = Date.now();
    const namespacedName = `mcp.${serverId}.${tool.name}`;
    const wrapper = this.toolWrappers.get(namespacedName);

    if (!wrapper) {
      return {
        success: false,
        error: `Tool wrapper not found: ${namespacedName}`,
        duration: Date.now() - startTime,
      };
    }

    // Check if this is a write operation that needs ask-high permission
    // MCP external writes (create, update, delete, etc.) ALWAYS require
    // interactive user confirmation regardless of policy settings.
    if (wrapper.isWrite) {
      const permRequest: ToolPermissionRequest = {
        toolName: namespacedName,
        riskCategory: "external_write",
        inputSummary: JSON.stringify(args).slice(0, 200),
        timestamp: Date.now(),
        sessionId: sessionId ?? "mcp",
      };

      if (this.permissionManager) {
        // askHigh=true: always prompt for MCP external write operations
        const result = await this.permissionManager.requestPermission(
          permRequest,
          true, // interactive
          true, // askHigh — always show the high-stakes warning
        );

        if (!result.granted) {
          return {
            success: false,
            error: `Permission denied: ${result.reason}`,
            duration: Date.now() - startTime,
          };
        }
      }
    }

    // Execute the tool
    try {
      const transport = this.transports.get(serverId);
      if (!transport) {
        return {
          success: false,
          error: `Transport not available for server: ${serverId}`,
          duration: Date.now() - startTime,
        };
      }

      const result = await transport.callTool(tool.name, args);

      return {
        success: !result.isError,
        data: this.formatToolResult(result),
        duration: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: String(err),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Format MCP tool result into a consistent structure
   */
  private formatToolResult(result: CMPCallToolResult): unknown {
    const formatted: string[] = [];

    for (const content of result.content) {
      if (content.type === "text") {
        formatted.push(content.text);
      } else if (content.type === "image") {
        formatted.push(`[Image: ${content.mimeType}]`);
      } else if (content.type === "resource") {
        formatted.push(`[Resource: ${content.resource.uri}]`);
      }
    }

    return {
      content: formatted,
      isError: result.isError,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * List all connected servers
   */
  listServers(): MCPConnectedServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get a server by ID
   */
  getServer(id: string): MCPConnectedServer | undefined {
    return this.servers.get(id);
  }

  /**
   * Get all tool wrappers
   */
  getToolWrappers(): MCPToolWrapper[] {
    return Array.from(this.toolWrappers.values());
  }

  /**
   * Get all tools as ToolDefinitions
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.toolWrappers.values()).map((w) => w.toolDefinition);
  }

  /**
   * Get a specific tool
   */
  getTool(namespacedName: string): ToolDefinition | undefined {
    return this.toolWrappers.get(namespacedName)?.toolDefinition;
  }

  /**
   * Check if a tool exists
   */
  hasTool(namespacedName: string): boolean {
    return this.toolWrappers.has(namespacedName);
  }

  /**
   * Add a server config and connect
   */
  async addServer(
    config: MCPServerConfig,
    target: "global" | "project" = "global",
    cwd?: string,
  ): Promise<void> {
    // Save to config
    addMCPServerToConfig(config, target, cwd);

    // Connect
    await this.connectServer(config);
  }

  /**
   * Remove a server
   */
  async removeServer(
    serverId: string,
    target: "global" | "project" = "global",
    cwd?: string,
  ): Promise<void> {
    // Disconnect
    await this.disconnectServer(serverId);

    // Remove from config
    removeMCPServerFromConfig(serverId, target, cwd);
  }

  /**
   * Disconnect a server
   */
  async disconnectServer(serverId: string): Promise<void> {
    const transport = this.transports.get(serverId);
    if (transport) {
      await transport.stop();
      this.transports.delete(serverId);
    }

    // Remove tool wrappers for this server
    for (const [name, wrapper] of this.toolWrappers) {
      if (wrapper.serverId === serverId) {
        this.toolWrappers.delete(name);
      }
    }

    this.servers.delete(serverId);
  }

  /**
   * Reconnect a server
   */
  async reconnectServer(serverId: string): Promise<void> {
    await this.disconnectServer(serverId);

    // Find the config
    const { servers } = loadAllMCPConfigs();
    const config = servers.find((s) => s.id === serverId);

    if (!config) {
      throw new Error(`Server config not found: ${serverId}`);
    }

    await this.connectServer(config);
  }

  /**
   * Check if a server is dangerous
   */
  isDangerous(serverId: string): boolean {
    const { servers } = loadAllMCPConfigs();
    const config = servers.find((s) => s.id === serverId);
    return config ? isServerDangerous(config) : false;
  }

  /**
   * Shutdown all connections
   */
  async shutdown(): Promise<void> {
    for (const [id] of this.transports) {
      try {
        await this.disconnectServer(id);
      } catch {
        // Ignore errors during shutdown
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

let globalManager: MCPClientManager | null = null;

export function createMCPClientManager(logger?: Logger): MCPClientManager {
  return new MCPClientManager(logger);
}

export function getGlobalMCPClientManager(): MCPClientManager {
  if (!globalManager) {
    globalManager = createMCPClientManager();
  }
  return globalManager;
}
