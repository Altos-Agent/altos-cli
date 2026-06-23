// @altos/mcp - Stdio MCP Server (Altos exposes tools via MCP over stdio)

import * as fs from "node:fs";
import * as path from "node:path";
import type { MCPTool } from "../types.js";

// =============================================================================
// MCP Server (Altos as an MCP Server over stdio)
// =============================================================================

/**
 * File entry for repo_map
 */
interface RepoMapEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: RepoMapEntry[];
  language?: string;
}

/**
 * StdioMCPServer - exposes Altos tools through the MCP protocol over stdin/stdout
 */
export class StdioMCPServer {
  private tools: Map<string, MCPTool> = new Map();
  private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>> =
    new Map();
  private protocolVersion = "2024-11-05";
  private serverName = "altos";
  private serverVersion = "1.0.0";
  private messageBuffer = "";

  constructor() {}

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

    this.toolHandlers.set("repo_map", async (args) => {
      try {
        const maxDepth = (args.maxDepth as number) ?? 3;
        const cwd = process.cwd();
        const tree = this.buildRepoTree(cwd, 0, maxDepth);

        return {
          success: true,
          data: tree,
          duration: 0,
        };
      } catch (err) {
        return {
          success: false,
          error: String(err),
          duration: 0,
        };
      }
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
          cwd: process.cwd(),
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
        },
        duration: 0,
      };
    });

    // Search (read-only)
    this.tools.set("search", {
      name: "search",
      description: "Search repository files and symbols",
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
            description: "Paths to search (defaults to cwd)",
          },
          limit: {
            type: "number",
            description: "Maximum results to return",
            default: 50,
          },
        },
        required: ["query"],
      },
    });

    this.toolHandlers.set("search", async (args) => {
      try {
        const query = args.query as string;
        const limit = (args.limit as number) ?? 50;
        const cwd = process.cwd();
        const searchPaths = (args.paths as string[] | undefined) ?? [cwd];

        const results: RepoMapEntry[] = [];

        for (const searchPath of searchPaths) {
          this.searchFiles(searchPath, query, results, limit);
        }

        return {
          success: true,
          data: {
            query,
            count: results.length,
            results: results.slice(0, limit),
          },
          duration: 0,
        };
      } catch (err) {
        return {
          success: false,
          error: String(err),
          duration: 0,
        };
      }
    });

    // Run skill (read-only) - stub with message
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

    this.toolHandlers.set("run_skill", async (args) => {
      const skill = args.skill as string;
      return {
        success: true,
        data: {
          message: "Skill execution requires full Altos context",
          skill,
          note: "Run 'altos run <skill>' with full Altos runtime for skill execution",
        },
        duration: 0,
      };
    });
  }

  /**
   * Build a repository tree starting from rootPath
   */
  private buildRepoTree(rootPath: string, depth: number, maxDepth: number): RepoMapEntry {
    const name = path.basename(rootPath) || rootPath;

    const entry: RepoMapEntry = {
      name,
      path: rootPath,
      type: "directory",
      children: [],
    };

    if (depth >= maxDepth) {
      return entry;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(rootPath, { withFileTypes: true });
    } catch {
      return entry;
    }

    // Filter out common ignore patterns
    const ignoreDirs = [
      ".git",
      "node_modules",
      ".next",
      ".nuxt",
      ".output",
      ".turbo",
      ".cache",
      "dist",
      "build",
      "out",
    ];

    for (const dirent of entries) {
      if (ignoreDirs.includes(dirent.name)) {
        continue;
      }

      const fullPath = path.join(rootPath, dirent.name);

      if (dirent.isDirectory()) {
        const childTree = this.buildRepoTree(fullPath, depth + 1, maxDepth);
        entry.children!.push(childTree);
      } else if (dirent.isFile()) {
        const ext = path.extname(dirent.name).toLowerCase();
        const language = this.getLanguageFromExt(ext);
        entry.children!.push({
          name: dirent.name,
          path: fullPath,
          type: "file",
          language,
        });
      }
    }

    // Sort: directories first, then alphabetically
    entry.children!.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });

    return entry;
  }

  /**
   * Get language from file extension
   */
  private getLanguageFromExt(ext: string): string {
    const languageMap: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".json": "json",
      ".yaml": "yaml",
      ".yml": "yaml",
      ".md": "markdown",
      ".css": "css",
      ".scss": "scss",
      ".less": "less",
      ".html": "html",
      ".htm": "html",
    };
    return languageMap[ext] ?? "unknown";
  }

  /**
   * Search files matching query
   */
  private searchFiles(
    searchPath: string,
    query: string,
    results: RepoMapEntry[],
    limit: number,
  ): void {
    if (results.length >= limit) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(searchPath, { withFileTypes: true });
    } catch {
      return;
    }

    const ignoreDirs = [
      ".git",
      "node_modules",
      ".next",
      ".nuxt",
      ".output",
      ".turbo",
      ".cache",
      "dist",
      "build",
      "out",
    ];
    const q = query.toLowerCase();

    for (const dirent of entries) {
      if (results.length >= limit) break;

      if (ignoreDirs.includes(dirent.name)) continue;

      const fullPath = path.join(searchPath, dirent.name);

      if (dirent.name.toLowerCase().includes(q)) {
        if (dirent.isFile()) {
          const ext = path.extname(dirent.name).toLowerCase();
          results.push({
            name: dirent.name,
            path: fullPath,
            type: "file",
            language: this.getLanguageFromExt(ext),
          });
        } else if (dirent.isDirectory()) {
          results.push({
            name: dirent.name,
            path: fullPath,
            type: "directory",
          });
        }
      }

      if (dirent.isDirectory()) {
        this.searchFiles(fullPath, query, results, limit);
      }
    }
  }

  /**
   * Handle incoming JSON-RPC message
   */
  private handleMessage(message: {
    jsonrpc: string;
    id?: string | number;
    method?: string;
    params?: Record<string, unknown>;
  }): Record<string, unknown> | null {
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
  private handleInitialize(id: string | number | undefined): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: this.protocolVersion,
        serverInfo: {
          name: this.serverName,
          version: this.serverVersion,
        },
        capabilities: {
          tools: {},
          resources: {},
        },
        instructions: "Altos MCP Server (stdio) - use tools/list to see available tools",
      },
    };
  }

  /**
   * Handle tools/list request
   */
  private handleListTools(id: string | number | undefined): Record<string, unknown> {
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
  private handleCallTool(
    id: string | number | undefined,
    params?: Record<string, unknown>,
  ): Record<string, unknown> {
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

    // Execute handler and format result
    handler(args)
      .then((result) => {
        const content: { type: "text"; text: string }[] = [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ];

        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            content,
            isError: !(result as { success?: boolean }).success,
          },
        };

        process.stdout.write(JSON.stringify(response) + "\n");
      })
      .catch((err) => {
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: String(err) }],
            isError: true,
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
      });

    // Return null since response is sent asynchronously
    return { jsonrpc: "2.0", id: undefined };
  }

  /**
   * Handle resources/list request
   */
  private handleListResources(id: string | number | undefined): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: [],
      },
    };
  }

  /**
   * Process a line of input
   */
  processLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const message = JSON.parse(trimmed);
      const response = this.handleMessage(message);

      // Only send response if it was a synchronous response (not from async handler)
      if (response && response.id !== undefined) {
        process.stdout.write(JSON.stringify(response) + "\n");
      }
    } catch {
      // Ignore malformed JSON
    }
  }

  /**
   * Start the stdio MCP server - reads from stdin and writes to stdout
   */
  start(): void {
    // Set encoding
    process.stdin.setEncoding("utf-8");

    // Handle stdin data
    process.stdin.on("data", (chunk: string) => {
      this.messageBuffer += chunk;
      const lines = this.messageBuffer.split("\n");
      this.messageBuffer = lines.pop() ?? "";

      for (const line of lines) {
        this.processLine(line);
      }
    });

    // Handle stdin close
    process.stdin.on("close", () => {
      process.exit(0);
    });

    // Handle errors
    process.stdin.on("error", () => {
      process.exit(1);
    });

    // Keep process alive
    if (process.stdout) {
      process.stdout.on("error", () => {
        // Client disconnected
      });
    }
  }

  /**
   * Stop the server
   */
  stop(): void {
    console.log("Altos MCP server (stdio) stopped");
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createStdioMCPServer(): StdioMCPServer {
  return new StdioMCPServer();
}
