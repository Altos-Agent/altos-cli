import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SessionRecorder } from "../src/session/recorder.js";
import type { RecordedEvent } from "../src/core/types.js";
import { FakeAgentRuntime } from "../src/runtime/fake-runtime.js";

describe("SessionRecorder", () => {
  const tmpDir = path.join(os.tmpdir(), `altos-test-recorder-${Date.now()}`);
  const sessionId = "test-session-001";
  const cwd = "/fake/cwd";

  let recorder: SessionRecorder;
  let runtime: FakeAgentRuntime;

  beforeEach(async () => {
    runtime = new FakeAgentRuntime({ sessionId });
    recorder = new SessionRecorder(runtime, sessionId, tmpDir, cwd);
  });

  afterEach(async () => {
    await recorder.stop("success").catch(() => {});
    if (fs.existsSync(tmpDir)) {
      await fs.promises.rm(tmpDir, { recursive: true });
    }
  });

  it("starts and creates the output directory", async () => {
    await recorder.start();
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "session.jsonl"))).toBe(true);
  });

  it("records events to session.jsonl", async () => {
    await recorder.start();

    const event1: RecordedEvent = { type: "user_message", ts: new Date().toISOString(), content: "hello" };
    const event2: RecordedEvent = { type: "assistant_message", ts: new Date().toISOString(), content: "hi there" };

    await recorder.record(event1);
    await recorder.record(event2);

    const jsonl = await fs.promises.readFile(path.join(tmpDir, "session.jsonl"), "utf-8");
    const lines = jsonl.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ type: "user_message" });
    expect(JSON.parse(lines[1])).toMatchObject({ type: "assistant_message" });
  });

  it("writes metadata.json on stop", async () => {
    await recorder.start();
    await recorder.record({ type: "user_message", ts: new Date().toISOString(), content: "hello" });
    await recorder.stop("success");

    const meta = JSON.parse(await fs.promises.readFile(path.join(tmpDir, "metadata.json"), "utf-8"));
    expect(meta.sessionId).toBe(sessionId);
    expect(meta.cwd).toBe(cwd);
    expect(meta.outcome).toBe("success");
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("writes error.txt when stop is called with error message", async () => {
    await recorder.start();
    await recorder.stop("error", "Something went wrong");

    const errorFile = path.join(tmpDir, "error.txt");
    expect(fs.existsSync(errorFile)).toBe(true);
    const errorContent = await fs.promises.readFile(errorFile, "utf-8");
    expect(errorContent).toBe("Something went wrong");
  });

  it("increments permissionsRequested on permission_requested events", async () => {
    await recorder.start();
    await recorder.record({ type: "permission_requested", ts: new Date().toISOString(), toolName: "Bash" });
    await recorder.record({ type: "permission_requested", ts: new Date().toISOString(), toolName: "Write" });
    await recorder.stop("success");

    const meta = JSON.parse(await fs.promises.readFile(path.join(tmpDir, "metadata.json"), "utf-8"));
    expect(meta.permissionsRequested).toBe(2);
  });

  it("increments permissionsDenied on permission_decision with granted=false", async () => {
    await recorder.start();
    await recorder.record({ type: "permission_decision", ts: new Date().toISOString(), granted: false });
    await recorder.record({ type: "permission_decision", ts: new Date().toISOString(), granted: true });
    await recorder.stop("success");

    const meta = JSON.parse(await fs.promises.readFile(path.join(tmpDir, "metadata.json"), "utf-8"));
    expect(meta.permissionsDenied).toBe(1);
  });

  it("accumulates token usage from token_usage events", async () => {
    await recorder.start();
    await recorder.record({ type: "token_usage", ts: new Date().toISOString(), input: 100, output: 50 });
    await recorder.record({ type: "token_usage", ts: new Date().toISOString(), input: 200, output: 75 });
    await recorder.stop("success");

    const meta = JSON.parse(await fs.promises.readFile(path.join(tmpDir, "metadata.json"), "utf-8"));
    expect(meta.tokenUsage).toEqual({ input: 300, output: 125 });
  });

  it("getEvents returns all recorded events in order", async () => {
    await recorder.start();
    const event1: RecordedEvent = { type: "user_message", ts: new Date().toISOString(), content: "a" };
    const event2: RecordedEvent = { type: "assistant_message", ts: new Date().toISOString(), content: "b" };
    await recorder.record(event1);
    await recorder.record(event2);

    const events = recorder.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "user_message", content: "a" });
    expect(events[1]).toMatchObject({ type: "assistant_message", content: "b" });
  });

  it("getSessionId returns the configured session ID", () => {
    expect(recorder.getSessionId()).toBe(sessionId);
  });

  it("getOutputDir returns the configured output directory", () => {
    expect(recorder.getOutputDir()).toBe(tmpDir);
  });

  it("getEvents returns a copy (not the internal array)", async () => {
    await recorder.start();
    await recorder.record({ type: "user_message", ts: new Date().toISOString(), content: "x" });
    const events1 = recorder.getEvents();
    const events2 = recorder.getEvents();
    expect(events1).not.toBe(events2);
    expect(events1).toEqual(events2);
  });
});
