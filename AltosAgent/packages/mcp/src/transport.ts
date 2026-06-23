// @altos/mcp - Stdio Transport for MCP protocol

import { spawn, ChildProcess, type SpawnOptions } from "node:child_process";
import type {
  MCPJsonRpcMessage,
  MCPInitializeParams,
  MCPInitializeResult,
  MCPListToolsResult,
  CMPCallToolResult,
} from "./types.js";

// =============================================================================
// Stdio Transport
// =============================================================================

/**
 * Stdio transport for communicating with MCP servers via stdin/stdout.
 * Implements the MCP JSON-RPC 2.0 protocol over stdio.
 */
export class StdioTransport {
  private process: ChildProcess | null = null;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: MCPJsonRpcMessage) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private notificationHandlers: Map<string, (params: Record<string, unknown>) => void> = new Map();
  private messageBuffer = "";
  private nextId = 1;
  private closed = false;

  constructor(
    private command: string,
    private args: string[] = [],
    private env: Record<string, string> = {},
  ) {}

  /**
   * Start the MCP server process
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error("Transport already started");
    }

    const options: SpawnOptions = {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.env },
      detached: false,
    };

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.command, this.args, options);
      } catch (err) {
        reject(new Error(`Failed to spawn "${this.command}": ${err}`));
        return;
      }

      if (!this.process.pid) {
        reject(new Error(`Failed to spawn "${this.command}": no pid`));
        return;
      }

      // Handle stderr
      this.process.stderr?.on("data", (data: Buffer) => {
        const lines = data.toString().trim().split("\n");
        for (const line of lines) {
          if (line) {
            console.error(`[mcp:stderr] ${line}`);
          }
        }
      });

      // Handle stdout - collect and process messages
      this.process.stdout?.on("data", (data: Buffer) => {
        this.messageBuffer += data.toString();
        this.processBuffer();
      });

      // Handle process exit
      this.process.on("exit", (code, signal) => {
        if (!this.closed) {
          this.closed = true;
          // Reject all pending requests
          for (const [, pending] of this.pendingRequests) {
            pending.reject(new Error(`MCP server exited with code ${code}, signal ${signal}`));
          }
          this.pendingRequests.clear();
        }
      });

      this.process.on("error", (err) => {
        if (!this.closed) {
          this.closed = true;
          for (const [, pending] of this.pendingRequests) {
            pending.reject(new Error(`MCP server error: ${err.message}`));
          }
          this.pendingRequests.clear();
        }
      });

      // Resolve once process is ready
      this.process.on("spawn", () => {
        resolve();
      });

      // Reject on immediate exit
      this.process.on("exit", (code) => {
        if (code !== null && code !== 0 && !this.closed) {
          reject(new Error(`MCP server exited immediately with code ${code}`));
        }
      });
    });
  }

  /**
   * Process buffered messages, splitting by newlines (JSON-RPC messages)
   */
  private processBuffer(): void {
    const lines = this.messageBuffer.split("\n");
    // Keep the last incomplete line in the buffer
    this.messageBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const message = JSON.parse(trimmed) as MCPJsonRpcMessage;
        this.handleMessage(message);
      } catch {
        // Ignore malformed JSON
        console.error(`[mcp] Failed to parse message: ${trimmed}`);
      }
    }
  }

  /**
   * Handle an incoming JSON-RPC message
   */
  private handleMessage(message: MCPJsonRpcMessage): void {
    // Response to a request
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        pending.resolve(message);
      }
      return;
    }

    // Notification (no id)
    if (message.method) {
      const handler = this.notificationHandlers.get(message.method);
      if (handler) {
        handler(message.params ?? {});
      }
    }
  }

  /**
   * Send a JSON-RPC request and wait for a response
   */
  async sendRequest<T extends MCPJsonRpcMessage>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (this.closed) {
      throw new Error("Transport is closed");
    }

    const id = this.nextId++;
    const message: MCPJsonRpcMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (msg) => {
          if (msg.error) {
            reject(new Error(`MCP error: ${msg.error.message}`));
          } else {
            resolve(msg as T);
          }
        },
        reject,
      });

      const payload = JSON.stringify(message) + "\n";
      if (!this.process?.stdin) {
        reject(new Error("stdin not available"));
        return;
      }

      this.process.stdin.write(payload, (err) => {
        if (err && !this.closed) {
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to write to stdin: ${err.message}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request "${method}" timed out after 30s`));
        }
      }, 30_000);
    });
  }

  /**
   * Send a notification (no response expected)
   */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    if (this.closed || !this.process?.stdin) return;

    const message: MCPJsonRpcMessage = {
      jsonrpc: "2.0",
      method,
      params,
    };

    try {
      this.process.stdin.write(JSON.stringify(message) + "\n");
    } catch {
      // Ignore write errors when closed
    }
  }

  /**
   * Register a notification handler
   */
  onNotification(method: string, handler: (params: Record<string, unknown>) => void): void {
    this.notificationHandlers.set(method, handler);
  }

  /**
   * Initialize the connection
   */
  async initialize(clientName: string, clientVersion: string): Promise<MCPInitializeResult> {
    // Send initialize request
    const params: MCPInitializeParams = {
      protocolVersion: "2024-11-05",
      clientInfo: { name: clientName, version: clientVersion },
      capabilities: {},
    };

    const response = await this.sendRequest<MCPJsonRpcMessage>(
      "initialize",
      params as unknown as Record<string, unknown>,
    );

    if (response.error) {
      throw new Error(`Initialize failed: ${response.error.message}`);
    }

    // Send initialized notification
    this.sendNotification("notifications/initialized");

    return response.result as MCPInitializeResult;
  }

  /**
   * List available tools
   */
  async listTools(): Promise<MCPListToolsResult> {
    const response = await this.sendRequest<MCPJsonRpcMessage>("tools/list");

    if (response.error) {
      throw new Error(`List tools failed: ${response.error.message}`);
    }

    return response.result as MCPListToolsResult;
  }

  /**
   * Call a tool
   */
  async callTool(name: string, arguments_: Record<string, unknown>): Promise<CMPCallToolResult> {
    const response = await this.sendRequest<MCPJsonRpcMessage>("tools/call", {
      name,
      arguments: arguments_,
    });

    if (response.error) {
      throw new Error(`Call tool failed: ${response.error.message}`);
    }

    return response.result as CMPCallToolResult;
  }

  /**
   * Ping the server
   */
  async ping(): Promise<void> {
    await this.sendRequest("ping");
  }

  /**
   * Stop the transport and kill the process
   */
  async stop(): Promise<void> {
    this.closed = true;

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error("Transport stopped"));
    }
    this.pendingRequests.clear();

    if (this.process && !this.process.killed) {
      // Try graceful shutdown first
      this.sendNotification("exit");

      // Force kill after 2 seconds
      setTimeout(() => {
        if (!this.process?.killed) {
          this.process?.kill("SIGTERM");
        }
      }, 2000);

      this.process.kill("SIGKILL");
    }

    this.process = null;
  }

  /**
   * Check if the transport is connected
   */
  isConnected(): boolean {
    return this.process !== null && !this.closed && this.process.exitCode === null;
  }
}
