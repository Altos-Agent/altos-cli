// @altos/local-api - tests for session listing and event streaming

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { LocalAPIServer } from "./index.js";

function makeGet(path: string): http.RequestOptions {
  return { method: "GET", path };
}

function makePost(path: string, body?: string): http.RequestOptions & { body?: string } {
  return { method: "POST", path, body };
}

function makePatch(path: string, body?: string): http.RequestOptions & { body?: string } {
  return { method: "PATCH", path, body };
}

/** Minimal HTTP request helper using the node:http module */
function rawRequest(
  server: http.Server,
  opts: http.RequestOptions & { body?: string },
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        ...opts,
        hostname: "localhost",
        port:
          server.address() instanceof Object ? (server.address() as { port: number }).port : 3001,
        headers: opts.body
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(opts.body) }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

describe("LocalAPIServer", () => {
  let server: LocalAPIServer;
  let httpServer: http.Server;

  beforeEach(async () => {
    server = new LocalAPIServer({ port: 0 }); // port 0 = random free port
    await server.start();
    httpServer = (server as unknown as { server: http.Server }).server;
  });

  afterEach(async () => {
    await server.stop();
  });

  // ─── GET /api/health ─────────────────────────────────────────────────

  it("GET /api/health returns 200 with mode", async () => {
    const res = await rawRequest(httpServer, makeGet("/api/health"));
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe("ok");
    expect(data.mode).toBe("local");
  });

  // ─── Session CRUD ──────────────────────────────────────────────────

  it("POST /api/sessions creates a session", async () => {
    const res = await rawRequest(httpServer, {
      ...makePost("/api/sessions", JSON.stringify({ prompt: "Hello" })),
    });
    expect(res.status).toBe(201);
    const s = JSON.parse(res.body);
    expect(s.id).toBeTruthy();
    expect(s.status).toBe("created");
    expect(s.input.prompt).toBe("Hello");
  });

  it("POST /api/sessions returns 400 for invalid JSON", async () => {
    const res = await rawRequest(httpServer, {
      method: "POST",
      path: "/api/sessions",
      body: "not json",
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBeTruthy();
  });

  it("GET /api/sessions lists sessions", async () => {
    // create a session first
    await rawRequest(httpServer, {
      ...makePost("/api/sessions", JSON.stringify({ prompt: "list test" })),
    });
    const res = await rawRequest(httpServer, makeGet("/api/sessions"));
    expect(res.status).toBe(200);
    const sessions = JSON.parse(res.body);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].id).toBeTruthy();
    expect(sessions[0].status).toBeTruthy();
  });

  it("GET /api/sessions/:id returns a session", async () => {
    const create = await rawRequest(httpServer, {
      ...makePost("/api/sessions", JSON.stringify({ prompt: "get test" })),
    });
    const { id } = JSON.parse(create.body);

    const res = await rawRequest(httpServer, makeGet(`/api/sessions/${id}`));
    expect(res.status).toBe(200);
    const s = JSON.parse(res.body);
    expect(s.id).toBe(id);
    expect(s.input.prompt).toBe("get test");
  });

  it("GET /api/sessions/:id returns 404 for unknown id", async () => {
    const res = await rawRequest(httpServer, makeGet("/api/sessions/does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("PATCH /api/sessions/:id updates status", async () => {
    const create = await rawRequest(httpServer, {
      ...makePost("/api/sessions", JSON.stringify({ prompt: "patch test" })),
    });
    const { id } = JSON.parse(create.body);

    const res = await rawRequest(httpServer, {
      ...makePatch(`/api/sessions/${id}`, JSON.stringify({ status: "running" })),
    });
    expect(res.status).toBe(200);
    const s = JSON.parse(res.body);
    expect(s.status).toBe("running");
  });

  // ─── Task listing ──────────────────────────────────────────────────

  it("POST /api/sessions then GET /api/sessions/:id/tasks returns tasks", async () => {
    const create = await rawRequest(httpServer, {
      ...makePost("/api/sessions", JSON.stringify({ prompt: "task test" })),
    });
    const { id: sessionId } = JSON.parse(create.body);

    // Create a task via the session's task enqueue mechanism (via cloud runtime)
    const { getLocalCloudRuntime } = await import("@altos/cloud");
    const runtime = getLocalCloudRuntime();
    await runtime.enqueueTask(sessionId);

    const res = await rawRequest(httpServer, makeGet(`/api/sessions/${sessionId}/tasks`));
    expect(res.status).toBe(200);
    const tasks = JSON.parse(res.body);
    expect(Array.isArray(tasks)).toBe(true);
  });

  // ─── Approvals ─────────────────────────────────────────────────────

  it("GET /api/approvals returns list of approvals", async () => {
    const res = await rawRequest(httpServer, makeGet("/api/approvals"));
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  it("PATCH /api/approvals/:id resolves approval", async () => {
    const { getLocalCloudRuntime } = await import("@altos/cloud");
    const runtime = getLocalCloudRuntime();
    const session = await runtime.createSession({ prompt: "approval test" });
    const task = await runtime.enqueueTask(session.id);
    const approval = await runtime.createApprovalRequest({
      sessionId: session.id,
      taskId: task.id,
      permission: "fs:write",
      toolCallId: "tool-1",
    });

    const res = await rawRequest(httpServer, {
      ...makePatch(
        `/api/approvals/${approval.id}`,
        JSON.stringify({ action: "approve", decidedBy: "admin" }),
      ),
    });
    expect(res.status).toBe(200);
    const r = JSON.parse(res.body);
    expect(r.status).toBe("approved");
    expect(r.decidedBy).toBe("admin");
  });

  // ─── Workers ───────────────────────────────────────────────────────

  it("GET /api/workers returns list of workers", async () => {
    const res = await rawRequest(httpServer, makeGet("/api/workers"));
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  // ─── Diffs ────────────────────────────────────────────────────────

  it("GET /api/diffs requires sessionId param", async () => {
    const res = await rawRequest(httpServer, makeGet("/api/diffs"));
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toBe("sessionId query param required");
  });

  it("GET /api/diffs?sessionId= returns diffs for session", async () => {
    const { getLocalCloudRuntime } = await import("@altos/cloud");
    const runtime = getLocalCloudRuntime();
    const session = await runtime.createSession({ prompt: "diff test" });

    const res = await rawRequest(httpServer, makeGet(`/api/diffs?sessionId=${session.id}`));
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.sessionId).toBe(session.id);
    expect(Array.isArray(data.patches)).toBe(true);
  });

  // ─── Not found ─────────────────────────────────────────────────────

  it("unknown path returns 404", async () => {
    const res = await rawRequest(httpServer, makeGet("/api/does-not-exist"));
    expect(res.status).toBe(404);
  });

  // ─── CORS preflight ───────────────────────────────────────────────

  it("OPTIONS returns 204 CORS headers", async () => {
    const res = await rawRequest(httpServer, { method: "OPTIONS", path: "/api/sessions" });
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});

describe("LocalAPIServer — WebSocket event streaming", () => {
  let server: LocalAPIServer;
  let httpServer: http.Server;
  let wsPort: number;

  beforeEach(async () => {
    server = new LocalAPIServer({ port: 0 });
    await server.start();
    httpServer = (server as unknown as { server: http.Server }).server;
    wsPort =
      httpServer.address() instanceof Object ? (httpServer.address() as { port: number }).port : 0;
  });

  afterEach(async () => {
    await server.stop();
  });

  it("WS /ws subscribe and receive session events", async () => {
    const { getLocalCloudRuntime } = await import("@altos/cloud");
    const runtime = getLocalCloudRuntime();
    const session = await runtime.createSession({ prompt: "ws test" });

    const ws = new WebSocket(`ws://localhost:${wsPort}/ws?sessionId=${session.id}`);
    const messages: string[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", reject);
    });
    ws.addEventListener("message", (ev) => {
      messages.push(ev.data.toString());
    });

    ws.send(JSON.stringify({ type: "subscribe", sessionId: session.id }));
    await new Promise((r) => setTimeout(r, 100));

    runtime.emitAgentEvent(session.id, { type: "test_event", payload: { hello: "world" } });
    await new Promise((r) => setTimeout(r, 200));

    expect(messages.some((m) => m.includes("test_event"))).toBe(true);
    ws.close();
  });

  it("WS receives multiple events", async () => {
    const { getLocalCloudRuntime } = await import("@altos/cloud");
    const runtime = getLocalCloudRuntime();
    const session = await runtime.createSession({ prompt: "order test" });

    const ws = new WebSocket(`ws://localhost:${wsPort}/ws`);
    const messages: string[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", reject);
    });
    ws.addEventListener("message", (ev) => {
      messages.push(ev.data.toString());
    });

    ws.send(JSON.stringify({ type: "subscribe", sessionId: session.id }));
    await new Promise((r) => setTimeout(r, 50));

    for (let i = 0; i < 3; i++) {
      runtime.emitAgentEvent(session.id, { seq: i });
    }
    await new Promise((r) => setTimeout(r, 300));

    const agentMessages = messages.filter((m) => m.includes("event:agent"));
    expect(agentMessages.length).toBe(3);
    ws.close();
  });
});
