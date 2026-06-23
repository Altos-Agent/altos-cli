// @altos/local-api - HTTP/WebSocket API for local Altos sessions
// Provides: session list/stream/approve/diffs
// All cloud features are optional — server works without any remote dependencies.

import { createServer, IncomingMessage, ServerResponse, type RequestListener } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import {
  getLocalCloudRuntime,
  type CloudRuntime,
  type CloudSession,
  type ApprovalAction,
  type CloudEvent,
} from "@altos/cloud";
import { createLogger } from "@altos/core";

// =============================================================================
// Types
// =============================================================================

export interface LocalAPIConfig {
  port?: number;
  host?: string;
  coordinatorUrl?: string;
}

interface ConnectedClient {
  sessionId: string;
  ws: WebSocket;
  ready: boolean;
}

// =============================================================================
// LocalAPIServer
// =============================================================================

const log = createLogger("local-api", "info");

export class LocalAPIServer {
  private config: Required<LocalAPIConfig>;
  private runtime: CloudRuntime;
  private server = createServer();
  private wss = new WebSocketServer({ server: this.server, path: "/ws" });
  private clients = new Map<string, ConnectedClient>();
  private abortController = new AbortController();

  constructor(config: LocalAPIConfig = {}) {
    this.config = {
      port: config.port ?? 3001,
      host: config.host ?? "localhost",
      coordinatorUrl: config.coordinatorUrl ?? "http://localhost:3001",
    };
    // Use the shared local cloud runtime
    this.runtime = getLocalCloudRuntime();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    this.server.on("request", this.requestHandler.bind(this));
    this.wss.on("connection", this.wsHandler.bind(this));

    await new Promise<void>((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        log.info(`Altos Local API listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.abortController.abort();
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();
    await new Promise<void>((resolve) => {
      this.server.close((err?: Error) => {
        if (err) log.error(`Server close error: ${err.message}`);
        resolve();
      });
    });
    log.info("Server stopped");
  }

  // ---------------------------------------------------------------------------
  // HTTP request routing
  // ---------------------------------------------------------------------------

  private requestHandler: RequestListener = (req, res) => {
    // CORS headers for local dev
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const path = url.pathname;

      if (path === "/api/sessions" && req.method === "GET") {
        return this.handleListSessions(res);
      }
      if (path === "/api/sessions" && req.method === "POST") {
        return this.handleCreateSession(req, res);
      }
      if (path.startsWith("/api/sessions/") && req.method === "GET") {
        const id = path.slice("/api/sessions/".length);
        const seg = id.indexOf("/");
        const sessionId = seg >= 0 ? id.slice(0, seg) : id;
        if (seg >= 0) {
          const rest = id.slice(seg + 1);
          if (rest === "events") return this.handleSSE(sessionId, req, res);
          if (rest === "tasks") return this.handleListTasks(sessionId, res);
          if (rest === "approvals") return this.handleListApprovals(sessionId, res);
          if (rest === "artifacts") return this.handleListArtifacts(sessionId, res);
          return this.handleNotFound(res);
        }
        return this.handleGetSession(sessionId, res);
      }
      if (path.startsWith("/api/sessions/") && req.method === "PATCH") {
        const id = path.slice("/api/sessions/".length);
        return this.handlePatchSession(id, req, res);
      }
      if (path.startsWith("/api/tasks") && req.method === "GET") {
        return this.handleListTasks(undefined, res);
      }
      if (path.startsWith("/api/tasks/") && req.method === "PATCH") {
        const taskId = path.slice("/api/tasks/".length);
        return this.handlePatchTask(taskId, req, res);
      }
      if (path === "/api/approvals" && req.method === "GET") {
        return this.handleListApprovals(undefined, res);
      }
      if (path.startsWith("/api/approvals/") && req.method === "PATCH") {
        const approvalId = path.slice("/api/approvals/".length);
        return this.handleResolveApproval(approvalId, req, res);
      }
      if (path === "/api/workers" && req.method === "GET") {
        return this.handleListWorkers(res);
      }
      if (path === "/api/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", mode: this.runtime.mode }));
        return;
      }
      if (path === "/api/diffs" && req.method === "GET") {
        const sessionId = url.searchParams.get("sessionId");
        return this.handleGetDiffs(sessionId, res);
      }

      return this.handleNotFound(res);
    } catch (err) {
      log.error(`Request error: ${err}`);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  };

  // ---------------------------------------------------------------------------
  // Session handlers
  // ---------------------------------------------------------------------------

  private async handleListSessions(res: ServerResponse): Promise<void> {
    const sessions = await this.runtime.listSessions();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(sessions));
  }

  private async handleGetSession(id: string, res: ServerResponse): Promise<void> {
    const session = await this.runtime.getSession(id);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(session));
  }

  private async handleCreateSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let input: { prompt: string; cwd?: string; model?: string; provider?: string };
    try {
      input = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const session = await this.runtime.createSession({
      prompt: input.prompt,
      cwd: input.cwd,
      model: input.model,
      provider: input.provider,
    });

    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify(session));
  }

  private async handlePatchSession(
    id: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    let patch: { status?: string };
    try {
      patch = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const session = await this.runtime.getSession(id);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    if (patch.status) {
      await this.runtime.updateSessionStatus(id, patch.status as CloudSession["status"]);
    }

    const updated = await this.runtime.getSession(id);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(updated));
  }

  // ---------------------------------------------------------------------------
  // SSE event stream
  // ---------------------------------------------------------------------------

  private handleSSE(sessionId: string, req: IncomingMessage, res: ServerResponse): void {
    const session = this.runtime.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Send initial connection event
    res.write(
      `event: cloud_event\ndata: ${JSON.stringify({ id: randomUUID(), sessionId, type: "connected", timestamp: Date.now(), payload: {} })}\n\n`,
    );

    // Subscribe to cloud events for this session
    const unsubscribe = this.runtime.subscribe(sessionId, (event: CloudEvent) => {
      res.write(`event: cloud_event\ndata: ${JSON.stringify(event)}\n\n`);
    });

    // Also listen on the WebSocket connection for cleanup
    req.on("close", () => {
      unsubscribe();
    });
  }

  // ---------------------------------------------------------------------------
  // Task handlers
  // ---------------------------------------------------------------------------

  private async handleListTasks(sessionId: string | undefined, res: ServerResponse): Promise<void> {
    const tasks = await this.runtime.listTasks(sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(tasks));
  }

  private async handlePatchTask(
    taskId: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    let patch: { status?: string; error?: string };
    try {
      patch = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    if (patch.status === "completed" || patch.status === "failed") {
      await this.runtime.completeTask(taskId, { error: patch.error });
    }

    const task = await this.runtime.getTask(taskId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(task));
  }

  // ---------------------------------------------------------------------------
  // Approval handlers
  // ---------------------------------------------------------------------------

  private async handleListApprovals(
    sessionId: string | undefined,
    res: ServerResponse,
  ): Promise<void> {
    const approvals = await this.runtime.listApprovalRequests(sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(approvals));
  }

  private async handleResolveApproval(
    id: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await readBody(req);
    let patch: { action: ApprovalAction; decidedBy?: string };
    try {
      patch = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    await this.runtime.resolveApproval(id, patch.action, patch.decidedBy);
    const approval = await this.runtime.getApprovalRequest(id);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(approval));
  }

  // ---------------------------------------------------------------------------
  // Worker handlers
  // ---------------------------------------------------------------------------

  private async handleListWorkers(res: ServerResponse): Promise<void> {
    const workers = await this.runtime.listWorkers();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(workers));
  }

  // ---------------------------------------------------------------------------
  // Diff handler
  // ---------------------------------------------------------------------------

  private async handleGetDiffs(sessionId: string | null, res: ServerResponse): Promise<void> {
    if (!sessionId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "sessionId query param required" }));
      return;
    }

    const session = await this.runtime.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session not found" }));
      return;
    }

    // Get all file_patch events from the session's event history
    // We re-export event types so the local-api can read session events
    // For now, return artifacts of type "patch"
    const artifacts = await this.runtime.listArtifacts(sessionId);
    const patches = artifacts.filter((a) => a.type === "patch");

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sessionId, patches }));
  }

  // ---------------------------------------------------------------------------
  // Artifact handlers
  // ---------------------------------------------------------------------------

  private async handleListArtifacts(sessionId: string, res: ServerResponse): Promise<void> {
    const artifacts = await this.runtime.listArtifacts(sessionId);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(artifacts));
  }

  // ---------------------------------------------------------------------------
  // WebSocket handler
  // ---------------------------------------------------------------------------

  private wsHandler(ws: WebSocket, req: IncomingMessage): void {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("sessionId") ?? "*";

    const client: ConnectedClient = { sessionId, ws, ready: false };
    this.clients.set(randomUUID(), client);

    ws.on("message", (data: string | Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          sessionId?: string;
          payload?: unknown;
        };
        if (msg.type === "subscribe" && msg.sessionId) {
          client.sessionId = msg.sessionId;
          client.ready = true;

          // Send current session state
          this.runtime.getSession(msg.sessionId).then((session) => {
            if (session) {
              ws.send(JSON.stringify({ type: "session", payload: session }));
            }
          });

          // Forward cloud events to this WS
          const unsub = this.runtime.subscribe(msg.sessionId, (event: CloudEvent) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(event));
            }
          });
          client.ws.on("close", () => unsub());
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      for (const [k, v] of this.clients.entries()) {
        if (v.ws === ws) {
          this.clients.delete(k);
          break;
        }
      }
    });

    ws.on("error", (err: Error) => {
      log.error(`WS error: ${err.message}`);
    });
  }

  // ---------------------------------------------------------------------------
  // Not found
  // ---------------------------------------------------------------------------

  private handleNotFound(res: ServerResponse): void {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
}

// =============================================================================
// Utility
// =============================================================================

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// =============================================================================
// CLI entry point
// =============================================================================

export interface ServerCLIConfig {
  port?: number;
  host?: string;
}

export async function startServer(cfg: ServerCLIConfig = {}): Promise<LocalAPIServer> {
  const server = new LocalAPIServer(cfg);
  await server.start();
  return server;
}

export async function runServer(cfg: ServerCLIConfig = {}): Promise<void> {
  const server = new LocalAPIServer(cfg);
  await server.start();
  log.info("Altos Local API running. Press Ctrl+C to stop.");

  // Keep process alive
  await new Promise(() => {});
}
