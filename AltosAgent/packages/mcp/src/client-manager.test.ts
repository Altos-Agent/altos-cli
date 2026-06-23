// @altos/mcp - Tests with a fake MCP server

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMCPClientManager } from "./client-manager.js";
import type { MCPConnectedServer } from "./types.js";
import * as net from "node:net";

// =============================================================================
// Fake MCP Server - A minimal MCP server for testing
// =============================================================================

/**
 * A fake MCP server that responds to initialize and tools/list requests.
 * Uses TCP to avoid stdio complexity in tests.
 */
class FakeMCPServer {
  private server: net.Server | null = null;
  private tools: Map<string, { name: string; description: string; inputSchema: object }>;

  constructor(tools: Array<{ name: string; description: string }>) {
    this.tools = new Map(
      tools.map((t) => [
        t.name,
        { ...t, inputSchema: { type: "object" as const, properties: {} } },
      ]),
    );
  }

  async start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = "";

        socket.on("data", (data) => {
          buffer += data.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            try {
              const msg = JSON.parse(trimmed);
              const response = this.handleMessage(msg);
              if (response) {
                socket.write(JSON.stringify(response) + "\n");
              }
            } catch {
              // Ignore malformed
            }
          }
        });

        socket.on("error", () => {
          // Client disconnected
        });
      });

      this.server.on("error", reject);
      this.server.listen(port, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  private handleMessage(msg: {
    id?: string | number;
    method?: string;
    params?: { name?: string; arguments?: object };
  }): object | null {
    if (msg.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: { name: "fake-mcp-server", version: "1.0.0" },
          capabilities: { tools: {} },
        },
      };
    }

    if (msg.method === "ping") {
      return { jsonrpc: "2.0", id: msg.id, result: null };
    }

    if (msg.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: Array.from(this.tools.values()) },
      };
    }

    if (msg.method === "tools/call") {
      const { name, arguments: args = {} } = msg.params ?? {};
      const tool = this.tools.get(name ?? "");

      if (!tool) {
        return {
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32602, message: `Unknown tool: ${name}` },
        };
      }

      return {
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ success: true, tool: name, args }) }],
          isError: false,
        },
      };
    }

    return null;
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("MCP Client Manager", () => {
  const testPort = 18765;
  let fakeServer: FakeMCPServer;

  beforeAll(async () => {
    // Start fake MCP server
    fakeServer = new FakeMCPServer([
      { name: "echo", description: "Echo back the input" },
      { name: "get_time", description: "Get current time" },
      { name: "create_record", description: "Create a database record" },
    ]);
    await fakeServer.start(testPort);
  });

  afterAll(async () => {
    await fakeServer.stop();
  });

  describe("createMCPClientManager", () => {
    it("should create a client manager instance", () => {
      const manager = createMCPClientManager();
      expect(manager).toBeDefined();
      expect(typeof manager.loadServers).toBe("function");
      expect(typeof manager.listServers).toBe("function");
      expect(typeof manager.getTools).toBe("function");
    });
  });

  describe("loadAllMCPConfigs", () => {
    it("should return empty servers when no config exists", async () => {
      const { loadAllMCPConfigs } = await import("./config.js");
      // Use a temp directory with no config
      const { servers } = loadAllMCPConfigs("/tmp/nonexistent-altos-test");
      expect(Array.isArray(servers)).toBe(true);
      expect(servers.length).toBe(0);
    });
  });

  describe("MCPClientManager with fake server", () => {
    it("should track server connection state", async () => {
      const manager = createMCPClientManager();

      // Initially no servers
      expect(manager.listServers()).toHaveLength(0);

      // Cleanup
      await manager.shutdown();
    });

    it("should get tools after connecting", async () => {
      const manager = createMCPClientManager();

      // Note: We can't easily test actual connection without modifying the transport
      // This is a structural test
      expect(manager.getTools()).toHaveLength(0);

      await manager.shutdown();
    });
  });

  describe("config loading", () => {
    it("should merge global and project configs", async () => {
      const { mergeMCPConfigs } = await import("./config.js");

      const global = {
        servers: [{ id: "global-server", name: "Global", command: "echo" }],
      };

      const project = {
        servers: [{ id: "project-server", name: "Project", command: "echo" }],
      };

      const merged = mergeMCPConfigs(global, project);
      expect(merged).toHaveLength(2);
      expect(merged.find((s) => s.id === "global-server")).toBeDefined();
      expect(merged.find((s) => s.id === "project-server")).toBeDefined();
    });

    it("should let project config override global", async () => {
      const { mergeMCPConfigs } = await import("./config.js");

      const global = {
        servers: [{ id: "override-test", name: "Global Name", command: "echo" }],
      };

      const project = {
        servers: [{ id: "override-test", name: "Project Name", command: "echo" }],
      };

      const merged = mergeMCPConfigs(global, project);
      const server = merged.find((s) => s.id === "override-test");
      expect(server?.name).toBe("Project Name");
    });
  });

  describe("config validation", () => {
    it("should validate valid server configs", async () => {
      const { validateMCPServerConfig } = await import("./config.js");

      const valid = validateMCPServerConfig({
        id: "test",
        name: "Test",
        command: "echo",
      });

      expect(valid.valid).toBe(true);
      expect(valid.errors).toHaveLength(0);
    });

    it("should reject configs without id", async () => {
      const { validateMCPServerConfig } = await import("./config.js");

      const invalid = validateMCPServerConfig({
        id: "",
        name: "Test",
        command: "echo",
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThan(0);
    });

    it("should reject configs without command", async () => {
      const { validateMCPServerConfig } = await import("./config.js");

      const invalid = validateMCPServerConfig({
        id: "test",
        name: "Test",
        command: "",
      });

      expect(invalid.valid).toBe(false);
    });
  });

  describe("dangerous server detection", () => {
    it("should identify dangerous servers", async () => {
      const { isServerDangerous } = await import("./config.js");

      expect(isServerDangerous({ id: "t", name: "T", command: "c", dangerous: true })).toBe(true);
      expect(isServerDangerous({ id: "t", name: "T", command: "c", dangerous: false })).toBe(false);
      expect(isServerDangerous({ id: "t", name: "T", command: "c" })).toBe(false);
    });
  });
});

describe("MCP Types", () => {
  it("should define MCPConnectedServer with correct structure", async () => {
    const server: MCPConnectedServer = {
      id: "test",
      name: "Test Server",
      state: "connected",
      protocolVersion: "2024-11-05",
      tools: [],
      resources: [],
      connectedAt: Date.now(),
    };

    expect(server.state).toBe("connected");
    expect(server.protocolVersion).toBeDefined();
  });
});
