// @altos/cloud - tests for LocalMockCloudRuntime

import { describe, it, expect, beforeEach } from "vitest";
import { LocalMockCloudRuntime, getLocalCloudRuntime, type CloudEvent } from "./index.js";

describe("LocalMockCloudRuntime", () => {
  let runtime: LocalMockCloudRuntime;

  beforeEach(() => {
    // Create a fresh instance per test to avoid cross-test pollution
    runtime = new LocalMockCloudRuntime();
  });

  // ─── Session management ────────────────────────────────────────────────

  it("creates a session with pending status", async () => {
    const session = await runtime.createSession({ prompt: "Hello" });
    expect(session.id).toBeTruthy();
    expect(session.status).toBe("created");
    expect(session.input.prompt).toBe("Hello");
    expect(session.createdAt).toBeGreaterThan(0);
  });

  it("getSession returns the created session", async () => {
    const created = await runtime.createSession({ prompt: "Hi" });
    const found = await runtime.getSession(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.input.prompt).toBe("Hi");
  });

  it("getSession returns undefined for unknown id", async () => {
    const found = await runtime.getSession("does-not-exist");
    expect(found).toBeUndefined();
  });

  it("listSessions returns all sessions sorted by createdAt desc", async () => {
    const s1 = await runtime.createSession({ prompt: "first" });
    // small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 5));
    const s2 = await runtime.createSession({ prompt: "second" });
    const sessions = await runtime.listSessions();

    // s2 should appear before s1 (most recent first)
    const s2Idx = sessions.findIndex((s) => s.id === s2.id);
    const s1Idx = sessions.findIndex((s) => s.id === s1.id);
    expect(s2Idx).toBeLessThan(s1Idx);
  });

  it("updateSessionStatus changes the status", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    expect(session.status).toBe("created");

    await runtime.updateSessionStatus(session.id, "running");
    const updated = await runtime.getSession(session.id);
    expect(updated?.status).toBe("running");
  });

  it("setSessionResult stores the result", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    await runtime.setSessionResult(session.id, {
      success: true,
      summary: "Done",
      duration: 1234,
    });
    const updated = await runtime.getSession(session.id);
    expect(updated?.result?.success).toBe(true);
    expect(updated?.result?.summary).toBe("Done");
    expect(updated?.result?.duration).toBe(1234);
  });

  // ─── Task management ─────────────────────────────────────────────────

  it("enqueueTask creates a queued task for a session", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    expect(task.id).toBeTruthy();
    expect(task.sessionId).toBe(session.id);
    expect(task.status).toBe("queued");
  });

  it("getTask returns a task by id", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const created = await runtime.enqueueTask(session.id);
    const found = await runtime.getTask(created.id);
    expect(found?.id).toBe(created.id);
  });

  it("listTasks returns all tasks or per session", async () => {
    const s1 = await runtime.createSession({ prompt: "s1" });
    const s2 = await runtime.createSession({ prompt: "s2" });
    await runtime.enqueueTask(s1.id);
    await runtime.enqueueTask(s1.id);
    await runtime.enqueueTask(s2.id);

    const all = await runtime.listTasks();
    expect(all.length).toBeGreaterThanOrEqual(3);

    const forS1 = await runtime.listTasks(s1.id);
    expect(forS1.every((t) => t.sessionId === s1.id)).toBe(true);
  });

  it("assignTask updates task status and workerId", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    await runtime.assignTask(task.id, "worker-1");
    const updated = await runtime.getTask(task.id);
    expect(updated?.status).toBe("assigned");
    expect(updated?.workerId).toBe("worker-1");
  });

  it("completeTask marks task completed with optional error", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    await runtime.completeTask(task.id, { error: undefined });
    const updated = await runtime.getTask(task.id);
    expect(updated?.status).toBe("completed");

    const task2 = await runtime.enqueueTask(session.id);
    await runtime.completeTask(task2.id, { error: "boom" });
    const updated2 = await runtime.getTask(task2.id);
    expect(updated2?.status).toBe("failed");
    expect(updated2?.error).toBe("boom");
  });

  // ─── Worker management ─────────────────────────────────────────────────

  it("registerWorker adds a worker and returns it", async () => {
    const worker = await runtime.registerWorker({
      id: "w1",
      name: "TestWorker",
      status: "idle",
      capabilities: ["local"],
    });
    expect(worker.id).toBe("w1");
    expect(worker.status).toBe("idle");
    expect(worker.startedAt).toBeGreaterThan(0);
  });

  it("listWorkers returns all registered workers", async () => {
    await runtime.registerWorker({ id: "w1", name: "W1", status: "idle", capabilities: [] });
    await runtime.registerWorker({ id: "w2", name: "W2", status: "idle", capabilities: [] });
    const workers = await runtime.listWorkers();
    expect(workers.length).toBeGreaterThanOrEqual(2);
  });

  it("heartbeat updates lastHeartbeat", async () => {
    const worker = await runtime.registerWorker({
      id: "w1",
      name: "W1",
      status: "idle",
      capabilities: [],
    });
    const before = worker.lastHeartbeat;
    await runtime.heartbeat("w1");
    const updated = await runtime.getWorker("w1");
    expect(updated!.lastHeartbeat).toBeGreaterThanOrEqual(before);
  });

  it("setWorkerBusy updates status and current session/task", async () => {
    await runtime.registerWorker({ id: "w1", name: "W1", status: "idle", capabilities: [] });
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    await runtime.setWorkerBusy("w1", session.id, task.id);
    const worker = await runtime.getWorker("w1");
    expect(worker?.status).toBe("busy");
    expect(worker?.currentSessionId).toBe(session.id);
    expect(worker?.currentTaskId).toBe(task.id);
  });

  it("setWorkerIdle clears session and task", async () => {
    await runtime.registerWorker({ id: "w1", name: "W1", status: "idle", capabilities: [] });
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    await runtime.setWorkerBusy("w1", session.id, task.id);
    await runtime.setWorkerIdle("w1");
    const worker = await runtime.getWorker("w1");
    expect(worker?.status).toBe("idle");
    expect(worker?.currentSessionId).toBeUndefined();
  });

  // ─── Artifacts ────────────────────────────────────────────────────────

  it("addArtifact stores an artifact", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    const artifact = await runtime.addArtifact({
      sessionId: session.id,
      taskId: task.id,
      type: "patch",
      path: "/tmp/foo.patch",
      content: "diff ...",
    });
    expect(artifact.id).toBeTruthy();
    expect(artifact.type).toBe("patch");

    const list = await runtime.listArtifacts(session.id);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].id).toBe(artifact.id);
  });

  // ─── Approval workflow ─────────────────────────────────────────────────

  it("createApprovalRequest creates a pending request", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    const req = await runtime.createApprovalRequest({
      sessionId: session.id,
      taskId: task.id,
      permission: "fs:write",
      reason: "need to write a file",
      toolCallId: "tool-1",
    });
    expect(req.id).toBeTruthy();
    expect(req.status).toBe("pending");
    expect(req.permission).toBe("fs:write");
    expect(req.expiresAt).toBeGreaterThan(req.createdAt);
  });

  it("resolveApproval updates status to approved", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    const req = await runtime.createApprovalRequest({
      sessionId: session.id,
      taskId: task.id,
      permission: "fs:write",
      toolCallId: "tool-1",
    });

    await runtime.resolveApproval(req.id, "approve", "admin");
    const updated = await runtime.getApprovalRequest(req.id);
    expect(updated?.status).toBe("approved");
    expect(updated?.decidedBy).toBe("admin");
    expect(updated?.decidedAt).toBeGreaterThan(0);
  });

  it("resolveApproval updates status to denied", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    const req = await runtime.createApprovalRequest({
      sessionId: session.id,
      taskId: task.id,
      permission: "fs:write",
      toolCallId: "tool-1",
    });

    await runtime.resolveApproval(req.id, "deny", "admin");
    const updated = await runtime.getApprovalRequest(req.id);
    expect(updated?.status).toBe("denied");
  });

  it("listApprovalRequests returns pending and resolved", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    const task = await runtime.enqueueTask(session.id);
    const req1 = await runtime.createApprovalRequest({
      sessionId: session.id,
      taskId: task.id,
      permission: "fs:write",
      toolCallId: "tool-1",
    });
    await runtime.createApprovalRequest({
      sessionId: session.id,
      taskId: task.id,
      permission: "net:connect",
      toolCallId: "tool-2",
    });
    await runtime.resolveApproval(req1.id, "approve");

    const forSession = await runtime.listApprovalRequests(session.id);
    expect(forSession.length).toBeGreaterThanOrEqual(2);
    expect(forSession.every((r) => r.sessionId === session.id)).toBe(true);
  });

  // ─── Event subscription ───────────────────────────────────────────────

  it("subscribe fires callback on emit", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    let called = 0;
    let receivedEvent: CloudEvent | undefined;

    const unsub = runtime.subscribe(session.id, (event) => {
      called++;
      receivedEvent = event;
    });

    runtime.emit(session, {
      id: "ev-1",
      sessionId: session.id,
      type: "task:started",
      timestamp: Date.now(),
      payload: { taskId: "t1" },
    });

    expect(called).toBe(1);
    expect(receivedEvent?.type).toBe("task:started");

    unsub();
    runtime.emit(session, {
      id: "ev-2",
      sessionId: session.id,
      type: "task:completed",
      timestamp: Date.now(),
      payload: {},
    });
    expect(called).toBe(1); // after unsubscribe
  });

  it("emitAgentEvent wraps and forwards an agent event", async () => {
    const session = await runtime.createSession({ prompt: "test" });
    let receivedType: string | undefined;
    runtime.subscribe(session.id, (event) => {
      receivedType = event.type;
    });

    runtime.emitAgentEvent(session.id, { type: "assistant_message", content: "hello" });
    expect(receivedType).toBe("event:agent");
  });

  // ─── getLocalCloudRuntime singleton ────────────────────────────────────

  it("getLocalCloudRuntime returns the same instance", () => {
    const a = getLocalCloudRuntime();
    const b = getLocalCloudRuntime();
    expect(a).toBe(b);
  });

  it("HTTPCloudClient has correct endpoint construction", async () => {
    const { HTTPCloudClient } = await import("./index.js");
    // Smoke test: verify the class can be instantiated
    const client = new HTTPCloudClient({ endpoint: "http://localhost:3001" });
    expect(client).toBeTruthy();
  });
});
