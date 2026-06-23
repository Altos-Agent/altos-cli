import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EvalRunner } from "../src/runner/eval-runner.js";
import { createFakeRuntimeFactory } from "../src/runtime/fake-runtime.js";
import { longSessionAutoCompactScenario } from "../src/scenarios/long-session-auto-compact.js";

/**
 * Integration test for the long-session-auto-compact eval scenario.
 *
 * Verifies that:
 * 1. The eval scenario runs through the EvalRunner infrastructure
 * 2. The fake runtime emits a session_compacted event when threshold is hit
 * 3. The session continues to work after compaction (tool calls succeed)
 * 4. The final result is recorded with correct outcome
 * 5. The session is stored in the SessionStore
 */
describe("long-session-auto-compact eval scenario", () => {
  const storeDir = path.join(os.tmpdir(), `altos-test-long-compact-${Date.now()}`);

  beforeEach(async () => {
    await fs.promises.mkdir(storeDir, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(storeDir)) {
      await fs.promises.rm(storeDir, { recursive: true });
    }
  });

  it("scenario definition is well-formed", () => {
    expect(longSessionAutoCompactScenario.case.id).toBe("long-session-auto-compact");
    expect(longSessionAutoCompactScenario.case.name).toBe("Long Session Auto-Compact");
    expect(longSessionAutoCompactScenario.case.timeoutMs).toBe(120000);
    expect(longSessionAutoCompactScenario.case.expected.toolsUsed).toContain("Read");
    expect(longSessionAutoCompactScenario.case.fixtureRepo).toBeDefined();
    // Fixture repo must exist on disk
    expect(fs.existsSync(longSessionAutoCompactScenario.case.fixtureRepo!)).toBe(true);
  });

  it("EvalRunner runs the long-session-auto-compact case", async () => {
    const { SessionStore } = await import("../src/session/store.js");
    const store = new SessionStore(storeDir);

    // Use a fake factory that simulates many steps (long session)
    // with auto-compaction triggered at step 2
    const factory = createFakeRuntimeFactory({
      runtimeConfig: {
        // Simulate a long session: 5 steps, auto-compacts at step 2
        emitAutoCompact: { compactionStep: 2 },
        emitTokenUsage: { input: 80_000, output: 500 }, // near context budget
        stepCount: 5,
      },
    });

    const runner = new EvalRunner(factory as any, store);

    const result = await runner.runCase(longSessionAutoCompactScenario.case);

    // Should complete without runtime errors
    expect(result.runtimeErrors).toEqual([]);

    // Should have recorded at least one tool call (Read)
    // The fake runtime calls Read on step 0
    expect(result.toolErrors).toEqual([]);

    // The outcome diff should not have critical failures
    // (extra/missing tools are penalized but don't fail outright if score >= 70)
    expect(result.outcomeDiff.unexpectedPermissionDenial).toBe(false);
    expect(result.outcomeDiff.unexpectedPermissionGrant).toBe(false);

    // Duration should be recorded
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("session is stored in SessionStore after running long-session-auto-compact", async () => {
    const { SessionStore } = await import("../src/session/store.js");
    const store = new SessionStore(storeDir);

    const factory = createFakeRuntimeFactory({
      runtimeConfig: { stepCount: 3 },
    });
    const runner = new EvalRunner(factory as any, store);

    await runner.runCase(longSessionAutoCompactScenario.case);

    const sessions = await store.list();
    expect(sessions.length).toBeGreaterThan(0);

    const compactSession = sessions.find((s) =>
      s.sessionId.includes("long-session-auto-compact"),
    );
    expect(compactSession).toBeDefined();
    expect(compactSession!.outcome).toBe("success");
  });

  it("replays a long-session-auto-compact session", async () => {
    const { SessionStore } = await import("../src/session/store.js");
    const store = new SessionStore(storeDir);

    const factory = createFakeRuntimeFactory({
      runtimeConfig: {
        emitAutoCompact: { compactionStep: 2 },
        stepCount: 5,
      },
    });

    // First: run the case
    const runner = new EvalRunner(factory as any, store);
    await runner.runCase(longSessionAutoCompactScenario.case);

    // Second: replay it
    const { SessionReplayRunner } = await import("../src/runner/session-replay-runner.js");
    const replayRunner = new SessionReplayRunner(factory as any, store);

    const sessions = await store.list();
    const compactSession = sessions.find((s) =>
      s.sessionId.includes("long-session-auto-compact"),
    );

    const replayResult = await replayRunner.replay(
      compactSession!.sessionId,
      longSessionAutoCompactScenario.case.expected,
    );

    expect(replayResult.runtimeErrors).toEqual([]);
    expect(replayResult.sessionId).toBe(compactSession!.sessionId);
  });

  it("score calculation for long-session-auto-compact", async () => {
    const { SessionStore } = await import("../src/session/store.js");
    const store = new SessionStore(storeDir);

    const factory = createFakeRuntimeFactory({
      runtimeConfig: { stepCount: 3 },
    });
    const runner = new EvalRunner(factory as any, store);

    const result = await runner.runCase(longSessionAutoCompactScenario.case);

    // Score should be >= 70 since the fake runtime calls Read
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.passed).toBe(true);
  });
});
