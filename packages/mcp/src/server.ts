// @altos/mcp - MCP Server (Altos as an MCP Server)

import { createServer } from "node:net";
import type { ToolDefinition } from "@altos/tools";
import type {
  MCPJsonRpcMessage,
  MCPInitializeResult,
  MCPServerCapabilities,
  MCPTool,
} from "./types.js";

// =============================================================================
// MCP Server (Altos exposes tools via MCP)
// =============================================================================

/**
 * List of dangerous tool patterns that should NOT be exposed by default
 */
const DANGEROUS_TOOL_PATTERNS = [
  /^bash$/,
  /^shell$/,
  /^exec$/,
  /^sudo$/,
  /^kill$/,
  /^rm[-_]?rf$/,
  /^drop$/,
  /^truncate$/,
  /^delete.*all$/i,
  /^destroy$/,
];

/**
 * Check if a tool should be considered dangerous
 */
function isDangerousTool(name: string): boolean {
  return DANGEROUS_TOOL_PATTERNS.some((p) => p.test(name));
}

/**
 * Transport type for MCP server
 */
export type MCPServerTransport = "tcp" | "stdio";

/**
 * Options for creating an MCP server
 */
export interface MCPServerOptions {
  transport: MCPServerTransport;
  port?: number;
  host?: string;
}

/**
 * MCP Server - exposes Altos tools through the MCP protocol
 */
export class MCPServer {
  private tools: Map<string, MCPTool> = new Map();
  private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>> =
    new Map();
  private protocolVersion = "2024-11-05";
  private serverName = "altos";
  private serverVersion = "1.0.0";
  private capabilities: MCPServerCapabilities = {
    tools: {},
    resources: {},
  };

  constructor(
    private port = 3000,
    private host = "127.0.0.1",
  ) {}

  /**
   * Expose tools from a ToolRegistry
   */
  exposeTools(tools: ToolDefinition[], options?: { includeDangerous?: boolean }): void {
    const includeDangerous = options?.includeDangerous ?? false;

    for (const tool of tools) {
      // Skip dangerous tools unless explicitly included
      if (!includeDangerous && isDangerousTool(tool.name)) {
        continue;
      }

      const mcpTool: MCPTool = {
        name: tool.name,
        description: tool.description,
        inputSchema: this.convertToMCPSchema(tool.inputSchema),
      };

      this.tools.set(tool.name, mcpTool);
      this.toolHandlers.set(tool.name, async (args) => {
        try {
          const result = await tool.execute(args, {
            sessionId: "mcp-server",
            cwd: process.cwd(),
          });
          return result;
        } catch (err) {
          return {
            success: false,
            error: String(err),
            duration: 0,
          };
        }
      });
    }
  }

  /**
   * Expose a specific set of Altos capabilities as read-only tools
   */
  exposeReadOnlyCapabilities(): void {
    // Expose repo map (read-only)
    this.tools.set("repo_map", {
      name: "repo_map",
      description: "Get the repository structure as a JSON tree",
      inputSchema: {
        type: "object",
        properties: {
          maxDepth: {
            type: "number",
            description: "Maximum directory depth",
            default: 3,
          },
        },
        required: [],
      },
    });

    this.toolHandlers.set("repo_map", async (_args) => {
      // This would integrate with the repository intelligence
      return {
        success: true,
        data: { message: "Use @altos/code-index for repository mapping" },
        duration: 0,
      };
    });

    // Session status (read-only)
    this.tools.set("session_status", {
      name: "session_status",
      description: "Get current session status",
      inputSchema: {
        type: "object",
        properties: {},
      },
    });

    this.toolHandlers.set("session_status", async () => {
      return {
        success: true,
        data: {
          status: "active",
          timestamp: Date.now(),
        },
        duration: 0,
      };
    });

    // Search (read-only)
    this.tools.set("search", {
      name: "search",
      description: "Search repository files",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          paths: {
            type: "array",
            items: { type: "string" },
            description: "Paths to search",
          },
        },
        required: ["query"],
      },
    });

    this.toolHandlers.set("search", async (_args) => {
      return {
        success: true,
        data: { message: "Use @altos/code-index for search" },
        duration: 0,
      };
    });

    // Run skill (read-only)
    this.tools.set("run_skill", {
      name: "run_skill",
      description: "Run an Alto's skill",
      inputSchema: {
        type: "object",
        properties: {
          skill: {
            type: "string",
            description: "Skill name",
          },
          args: {
            type: "string",
            description: "Skill arguments",
          },
        },
        required: ["skill"],
      },
    });

    this.toolHandlers.set("run_skill", async (_args) => {
      return {
        success: true,
        data: { message: "Skill execution requires full Altos context" },
        duration: 0,
      };
    });
  }

  /**
   * Convert Altos input schema to MCP schema
   */
  private convertToMCPSchema(schema: ToolDefinition["inputSchema"]): MCPTool["inputSchema"] {
    return {
      type: "object",
      properties: schema.properties as unknown as Record<
        string,
        import("./types.js").MCPToolProperty
      >,
      required: schema.required,
      additionalProperties: schema.additionalProperties,
    };
  }

  /**
   * Handle incoming JSON-RPC message
   */
  private async handleMessage(message: MCPJsonRpcMessage): Promise<MCPJsonRpcMessage | null> {
    if (!message.method) {
      return null;
    }

    const { method, id, params } = message;

    switch (method) {
      case "initialize":
        return this.handleInitialize(id);

      case "ping":
        return { jsonrpc: "2.0", id, result: null };

      case "tools/list":
        return this.handleListTools(id);

      case "tools/call":
        return this.handleCallTool(id, params);

      case "resources/list":
        return this.handleListResources(id);

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(id: string | number | undefined): MCPJsonRpcMessage {
    const result: MCPInitializeResult = {
      protocolVersion: this.protocolVersion,
      serverInfo: {
        name: this.serverName,
        version: this.serverVersion,
      },
      capabilities: this.capabilities,
      instructions: "Altos MCP Server - use tools/list to see available tools",
    };

    return { jsonrpc: "2.0", id, result };
  }

  /**
   * Handle tools/list request
   */
  private handleListTools(id: string | number | undefined): MCPJsonRpcMessage {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: Array.from(this.tools.values()),
      },
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleCallTool(
    id: string | number | undefined,
    params?: Record<string, unknown>,
  ): Promise<MCPJsonRpcMessage> {
    if (!params) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "Invalid params: missing name" },
      };
    }

    const { name, arguments: args = {} } = params as {
      name: string;
      arguments?: Record<string, unknown>;
    };

    const handler = this.toolHandlers.get(name);
    if (!handler) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: `Tool not found: ${name}` },
      };
    }

    try {
      const result = await handler(args);

      // Format result as MCP content
      const content: { type: "text"; text: string }[] = [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ];

      return {
        jsonrpc: "2.0",
        id,
        result: {
          content,
          isError: !(result as { success?: boolean }).success,
        },
      };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: String(err) }],
          isError: true,
        },
      };
    }
  }

  /**
   * Handle resources/list request
   */
  private handleListResources(id: string | number | undefined): MCPJsonRpcMessage {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: [],
      },
    };
  }

  /**
   * Start the MCP server over TCP
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        let buffer = "";

        socket.on("data", async (data) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const message = JSON.parse(trimmed) as MCPJsonRpcMessage;
              const response = await this.handleMessage(message);

              if (response) {
                socket.write(JSON.stringify(response) + "\n");
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        });

        socket.on("error", () => {
          // Client disconnected
        });
      });

      server.on("error", reject);
      server.listen(this.port, this.host, () => {
        console.log(`Altos MCP server listening on ${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    // Server doesn't hold persistent state, just close
    console.log("Altos MCP server stopped");
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createMCPServer(port?: number, host?: string): MCPServer {
  return new MCPServer(port, host);
}

export function createMCPServerWithTransport(options: MCPServerOptions): MCPServer {
  if (options.transport === "stdio") {
    // For stdio transport, we return a special server that just logs - actual stdio
    // server is started via the CLI directly using StdioMCPServer class
    // This is a fallback for backward compatibility
    console.warn("For stdio transport, use StdioMCPServer directly");
    return new MCPServer(options.port ?? 3000, options.host ?? "127.0.0.1");
  }
  return new MCPServer(options.port ?? 3000, options.host ?? "127.0.0.1");
}
