import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionStore } from "../src/session/store.js";
import type { RecordedEvent, SessionMetadata } from "../src/core/types.js";

describe("SessionStore", () => {
  const baseDir = path.join(os.tmpdir(), `altos-test-store-${Date.now()}`);
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(baseDir);
  });

  afterEach(async () => {
    if (fs.existsSync(baseDir)) {
      await fs.promises.rm(baseDir, { recursive: true });
    }
  });

  // -------------------------------------------------------------------------
  // save + load
  // -------------------------------------------------------------------------

  it("saves session.jsonl and metadata.json", async () => {
    const sessionId = "session-001";
    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test/cwd",
      modelConfig: { model: "test-model" },
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1234,
      tokenUsage: { input: 100, output: 50 },
      permissionsRequested: 2,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
      { type: "assistant_message", ts: new Date().toISOString(), content: "hi" },
    ];

    await store.save(sessionId, metadata, events);

    const sessionDir = path.join(baseDir, sessionId);
    expect(fs.existsSync(sessionDir)).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "session.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "metadata.json"))).toBe(true);
  });

  it("round-trips a saved session through load", async () => {
    const sessionId = "session-002";
    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test/cwd",
      modelConfig: { model: "claude-3-5" },
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      completedAt: new Date("2024-01-01T00:01:00Z").toISOString(),
      outcome: "success",
      durationMs: 60000,
      permissionsRequested: 3,
      permissionsDenied: 1,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "first" },
      { type: "assistant_message", ts: new Date().toISOString(), content: "second" },
      { type: "tool_call_completed", ts: new Date().toISOString(), toolName: "Read" },
    ];

    await store.save(sessionId, metadata, events);
    const loaded = await store.load(sessionId);

    expect(loaded.sessionId).toBe(sessionId);
    expect(loaded.metadata.outcome).toBe("success");
    expect(loaded.events).toHaveLength(3);
    expect(loaded.events[0]).toMatchObject({ type: "user_message", content: "first" });
    expect(loaded.events[2]).toMatchObject({ type: "tool_call_completed", toolName: "Read" });
  });

  it("load throws when session does not exist", async () => {
    await expect(store.load("nonexistent-session")).rejects.toThrow();
  });

  it("load throws when metadata.json is missing", async () => {
    const sessionId = "session-003";
    const dir = path.join(baseDir, sessionId);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, "session.jsonl"), "");
    await expect(store.load(sessionId)).rejects.toThrow();
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  it("list returns empty array when base dir does not exist", async () => {
    const empty = await store.list();
    expect(empty).toEqual([]);
  });

  it("list returns all stored sessions sorted by createdAt descending", async () => {
    const session1: SessionMetadata = {
      sessionId: "session-list-001",
      cwd: "/c",
      modelConfig: {},
      createdAt: new Date("2024-01-01T01:00:00Z").toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const session2: SessionMetadata = {
      sessionId: "session-list-002",
      cwd: "/c",
      modelConfig: {},
      createdAt: new Date("2024-01-01T02:00:00Z").toISOString(),
      outcome: "failed",
      durationMs: 2000,
      permissionsRequested: 1,
      permissionsDenied: 1,
    };
    const session3: SessionMetadata = {
      sessionId: "session-list-003",
      cwd: "/c",
      modelConfig: {},
      createdAt: new Date("2024-01-01T00:00:00Z").toISOString(),
      outcome: "error",
      durationMs: 500,
      permissionsRequested: 2,
      permissionsDenied: 0,
    };

    await store.save(session1.sessionId, session1, []);
    await store.save(session2.sessionId, session2, []);
    await store.save(session3.sessionId, session3, []);

    const listed = await store.list();

    expect(listed).toHaveLength(3);
    // Most recent first
    expect(listed[0].sessionId).toBe("session-list-002");
    expect(listed[1].sessionId).toBe("session-list-001");
    expect(listed[2].sessionId).toBe("session-list-003");
  });

  it("list skips corrupted session directories", async () => {
    // Create a valid session
    const valid: SessionMetadata = {
      sessionId: "session-valid",
      cwd: "/c",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 100,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    await store.save(valid.sessionId, valid, []);

    // Create a directory without metadata.json
    const badDir = path.join(baseDir, "session-corrupted");
    await fs.promises.mkdir(badDir, { recursive: true });
    await fs.promises.writeFile(path.join(badDir, "session.jsonl"), "not-valid-json\n");

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].sessionId).toBe("session-valid");
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  it("deletes a session directory", async () => {
    const sessionId = "session-to-delete";
    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/c",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 100,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    await store.save(sessionId, metadata, []);

    const dir = path.join(baseDir, sessionId);
    expect(fs.existsSync(dir)).toBe(true);

    await store.delete(sessionId);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("delete is idempotent (no error when session does not exist)", async () => {
    await expect(store.delete("nonexistent")).resolves.toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // getPath
  // -------------------------------------------------------------------------

  it("getPath returns the session directory path", () => {
    expect(store.getPath("my-session")).toBe(path.join(baseDir, "my-session"));
  });
});
