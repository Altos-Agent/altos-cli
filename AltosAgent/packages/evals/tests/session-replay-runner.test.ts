import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionReplayRunner } from "../src/runner/session-replay-runner.js";
import { SessionStore } from "../src/session/store.js";
import { createFakeRuntimeFactory } from "../src/runtime/fake-runtime.js";
import type { RecordedEvent, SessionMetadata } from "../src/core/types.js";

describe("SessionReplayRunner", () => {
  const storeDir = path.join(os.tmpdir(), `altos-test-replay-${Date.now()}`);
  let store: SessionStore;
  let runner: SessionReplayRunner;

  beforeEach(async () => {
    await fs.promises.mkdir(storeDir, { recursive: true });
    store = new SessionStore(storeDir);
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    runner = new SessionReplayRunner(factory as any, store);
  });

  afterEach(async () => {
    if (fs.existsSync(storeDir)) {
      await fs.promises.rm(storeDir, { recursive: true });
    }
  });

  // -------------------------------------------------------------------------
  // Replay loads from the store and re-executes
  // -------------------------------------------------------------------------

  it("replays a stored session", async () => {
    const sessionId = "replay-session-001";

    // Pre-store a session
    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
    ];
    await store.save(sessionId, metadata, events);

    const result = await runner.replay(sessionId, {});

    expect(result.caseId).toBe(sessionId);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.sessionId).toBe(sessionId);
  });

  it("fails gracefully when session is not found", async () => {
    const result = await runner.replay("nonexistent-session", {});

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.runtimeErrors.length).toBeGreaterThan(0);
    expect(result.runtimeErrors[0]).toContain("Failed to load session");
  });

  it("returns outcome from fresh replay (not original metadata)", async () => {
    const sessionId = "replay-session-002";

    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
    ];
    await store.save(sessionId, metadata, events);

    const result = await runner.replay(sessionId, {});

    // The replay should save its own fresh session, overriding the stored
    const sessions = await store.list();
    const fresh = sessions.find((s) => s.sessionId === sessionId);
    expect(fresh).toBeDefined();
    // Outcome should be success (no runtime errors in replay)
    expect(result.runtimeErrors).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Outcome comparison during replay
  // -------------------------------------------------------------------------

  it("detects missing expected tools in replay", async () => {
    const sessionId = "replay-session-003";

    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
    ];
    await store.save(sessionId, metadata, events);

    const result = await runner.replay(sessionId, {
      toolsUsed: ["NonExistentTool"],
    });

    expect(result.outcomeDiff.missingTools).toContain("NonExistentTool");
    expect(result.passed).toBe(false);
  });

  it("passes when all expected tools are used in replay", async () => {
    const sessionId = "replay-session-004";

    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    // FakeRuntime calls "Read" on step 0 and "Bash" on step 1
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
    ];
    await store.save(sessionId, metadata, events);

    const result = await runner.replay(sessionId, {
      toolsUsed: ["Read", "Bash"],
    });

    expect(result.outcomeDiff.missingTools).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  // -------------------------------------------------------------------------
  // Permission denial in replay
  // -------------------------------------------------------------------------

  it("detects permission denial in replay", async () => {
    const sessionId = "replay-session-005";

    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
    ];
    await store.save(sessionId, metadata, events);

    // Run with a factory that emits permission denial
    const permFactory = createFakeRuntimeFactory({
      runtimeConfig: { emitPermissionRequest: true },
      stepCount: 2,
    });
    const permRunner = new SessionReplayRunner(permFactory as any, store);

    const result = await permRunner.replay(sessionId, { permissionDenied: false });

    expect(result.outcomeDiff.unexpectedPermissionDenial).toBe(true);
    expect(result.passed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Replay after compaction
  // -------------------------------------------------------------------------

  it("replays a session that had auto-compaction", async () => {
    const sessionId = "replay-session-006";

    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 5000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
      // Simulate events before and after compaction
      { type: "session_compacted", ts: new Date().toISOString(), sessionId },
    ];
    await store.save(sessionId, metadata, events);

    // Run with a factory that emits auto-compaction
    const compactFactory = createFakeRuntimeFactory({
      runtimeConfig: { emitAutoCompact: { compactionStep: 1 } },
      stepCount: 3,
    });
    const compactRunner = new SessionReplayRunner(compactFactory as any, store);

    const result = await compactRunner.replay(sessionId, {});

    // Replay should complete without errors
    expect(result.runtimeErrors).toEqual([]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // Tool errors in replay
  // -------------------------------------------------------------------------

  it("captures tool errors during replay", async () => {
    const sessionId = "replay-session-007";

    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
    ];
    await store.save(sessionId, metadata, events);

    // Run with a factory that emits dangerous refusal
    const dangerFactory = createFakeRuntimeFactory({
      runtimeConfig: { emitDangerousRefusal: true },
      stepCount: 2,
    });
    const dangerRunner = new SessionReplayRunner(dangerFactory as any, store);

    const result = await dangerRunner.replay(sessionId, {});

    expect(result.toolErrors.length).toBeGreaterThan(0);
    expect(result.toolErrors[0].error).toContain("dangerous");
  });

  // -------------------------------------------------------------------------
  // Permission events in replay
  // -------------------------------------------------------------------------

  it("captures permission events during replay", async () => {
    const sessionId = "replay-session-008";

    const metadata: SessionMetadata = {
      sessionId,
      cwd: "/test",
      modelConfig: {},
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      outcome: "success",
      durationMs: 1000,
      permissionsRequested: 0,
      permissionsDenied: 0,
    };
    const events: RecordedEvent[] = [
      { type: "user_message", ts: new Date().toISOString(), content: "hello" },
    ];
    await store.save(sessionId, metadata, events);

    const permFactory = createFakeRuntimeFactory({
      runtimeConfig: { emitPermissionRequest: true },
      stepCount: 2,
    });
    const permRunner = new SessionReplayRunner(permFactory as any, store);

    const result = await permRunner.replay(sessionId, {});

    expect(result.permissionEvents.length).toBeGreaterThan(0);
    const denied = result.permissionEvents.find((e) => !e.granted);
    expect(denied).toBeDefined();
  });
});
