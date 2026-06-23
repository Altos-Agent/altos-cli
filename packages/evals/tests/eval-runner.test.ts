import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EvalRunner } from "../src/runner/eval-runner.js";
import { createFakeRuntimeFactory } from "../src/runtime/fake-runtime.js";
import type { EvalCase, ExpectedOutcome } from "../src/core/types.js";

describe("EvalRunner", () => {
  // Use a temp directory for the session store
  const storeDir = path.join(os.tmpdir(), `altos-test-runner-store-${Date.now()}`);

  beforeEach(async () => {
    await fs.promises.mkdir(storeDir, { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(storeDir)) {
      await fs.promises.rm(storeDir, { recursive: true });
    }
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function makeCase(overrides: Partial<EvalCase> = {}): EvalCase {
    return {
      id: "test-case",
      name: "Test Case",
      description: "A smoke test for EvalRunner",
      prompt: "Do something",
      timeoutMs: 30_000,
      expected: {},
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Smoke test: runs to completion without error
  // -------------------------------------------------------------------------

  it("runCase completes without throwing", async () => {
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    const runner = new EvalRunner(factory as any, undefined as any);

    const result = await runner.runCase(makeCase());

    expect(result.caseId).toBe("test-case");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.runtimeErrors).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Tool scoring
  // -------------------------------------------------------------------------

  it("scores missing expected tools", async () => {
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    const runner = new EvalRunner(factory as any, undefined as any);

    // FakeAgentRuntime calls "Read" on step 0 and "Bash" on step 1
    const result = await runner.runCase(
      makeCase({
        id: "missing-tools",
        expected: { toolsUsed: ["NonExistentTool"] } satisfies ExpectedOutcome,
      }),
    );

    // Score should be deducted for missing tools
    expect(result.score).toBeLessThan(100);
    expect(result.outcomeDiff.missingTools).toContain("NonExistentTool");
  });

  it("scores extra tools used that were not expected", async () => {
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    const runner = new EvalRunner(factory as any, undefined as any);

    const result = await runner.runCase(
      makeCase({
        id: "extra-tools",
        expected: { toolsUsed: ["Read"], toolsNotUsed: ["Bash"] } satisfies ExpectedOutcome,
      }),
    );

    expect(result.outcomeDiff.extraTools).toContain("Bash");
    // Score deduction: -10 for Bash being in extraTools (100 - 10 = 90)
    expect(result.score).toBe(90);
    expect(result.passed).toBe(true); // 90 >= 70, only penalized not failed
  });

  // -------------------------------------------------------------------------
  // Permission denial detection
  // -------------------------------------------------------------------------

  it("detects unexpected permission denial", async () => {
    const factory = createFakeRuntimeFactory({
      runtimeConfig: { emitPermissionRequest: true },
      stepCount: 2,
    });
    const runner = new EvalRunner(factory as any, undefined as any);

    // Expected: no permission denied, but the fake runtime denies
    const result = await runner.runCase(
      makeCase({
        id: "perm-denial",
        expected: { permissionDenied: false } satisfies ExpectedOutcome,
      }),
    );

    expect(result.outcomeDiff.unexpectedPermissionDenial).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("passes when permission denial is expected", async () => {
    const factory = createFakeRuntimeFactory({
      runtimeConfig: { emitPermissionRequest: true },
      stepCount: 2,
    });
    const runner = new EvalRunner(factory as any, undefined as any);

    const result = await runner.runCase(
      makeCase({
        id: "perm-denied-expected",
        expected: { permissionDenied: true } satisfies ExpectedOutcome,
      }),
    );

    expect(result.outcomeDiff.unexpectedPermissionDenial).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Dangerous command refusal detection
  // -------------------------------------------------------------------------

  it("detects dangerous command refusal", async () => {
    const factory = createFakeRuntimeFactory({
      runtimeConfig: { emitDangerousRefusal: true },
      stepCount: 2,
    });
    const runner = new EvalRunner(factory as any, undefined as any);

    // Expected: dangerousRefused = true (the fake runtime refuses)
    const result = await runner.runCase(
      makeCase({
        id: "dangerous-refusal",
        expected: { dangerousRefused: true } satisfies ExpectedOutcome,
      }),
    );

    expect(result.outcomeDiff.unexpectedDangerousRefusal).toBe(false);
  });

  it("flags unexpected dangerous refusal in outcomeDiff and deducts score", async () => {
    const factory = createFakeRuntimeFactory({
      runtimeConfig: { emitDangerousRefusal: true },
      stepCount: 2,
    });
    const runner = new EvalRunner(factory as any, undefined as any);

    // We expect Read was used (so missingTools=[] and isPassed is not blocked by that),
    // and dangerousRefused=false but the fake runtime refused the Bash call
    const result = await runner.runCase(
      makeCase({
        id: "dangerous-unexpected",
        expected: { toolsUsed: ["Read"], dangerousRefused: false } satisfies ExpectedOutcome,
      }),
    );

    // isPassed() does not gate on dangerousRefusal, only on score/permission/missingTools
    // Score: 100 - 20 (unexpectedDangerousRefusal) = 80 >= 70 → passed=true
    expect(result.outcomeDiff.unexpectedDangerousRefusal).toBe(true);
    expect(result.score).toBe(80);
    expect(result.passed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Session is stored in the SessionStore
  // -------------------------------------------------------------------------

  it("stores the session in SessionStore after runCase", async () => {
    const { SessionStore } = await import("../src/session/store.js");
    const store = new SessionStore(storeDir);
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    const runner = new EvalRunner(factory as any, store);

    await runner.runCase(makeCase({ id: "stored-session" }));

    // Should be loadable
    const sessions = await store.list();
    const stored = sessions.find((s) => s.sessionId.includes("stored-session"));
    expect(stored).toBeDefined();
    expect(stored!.outcome).toBe("success");
  });

  // -------------------------------------------------------------------------
  // runSuite
  // -------------------------------------------------------------------------

  it("runSuite runs all cases", async () => {
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    const runner = new EvalRunner(factory as any, undefined as any);

    const cases = [
      makeCase({ id: "suite-1" }),
      makeCase({ id: "suite-2" }),
      makeCase({ id: "suite-3" }),
    ];

    const results = await runner.runSuite(cases);

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.caseId)).toEqual(["suite-1", "suite-2", "suite-3"]);
    expect(results.every((r) => r.runtimeErrors.length === 0)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Tool errors are captured
  // -------------------------------------------------------------------------

  it("captures tool call failures in toolErrors", async () => {
    const factory = createFakeRuntimeFactory({
      runtimeConfig: { emitDangerousRefusal: true },
      stepCount: 2,
    });
    const runner = new EvalRunner(factory as any, undefined as any);

    const result = await runner.runCase(makeCase({ id: "tool-error" }));

    expect(result.toolErrors.length).toBeGreaterThan(0);
    expect(result.toolErrors[0].toolName).toBeDefined();
    expect(result.toolErrors[0].error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Permission events are captured
  // -------------------------------------------------------------------------

  it("captures permission events", async () => {
    const factory = createFakeRuntimeFactory({
      runtimeConfig: { emitPermissionRequest: true },
      stepCount: 2,
    });
    const runner = new EvalRunner(factory as any, undefined as any);

    const result = await runner.runCase(makeCase({ id: "perm-events" }));

    expect(result.permissionEvents.length).toBeGreaterThan(0);
    const denied = result.permissionEvents.find((e) => !e.granted);
    expect(denied).toBeDefined();
    expect(denied!.toolName).toBe("Bash");
  });

  // -------------------------------------------------------------------------
  // Message count range validation
  // -------------------------------------------------------------------------

  it("detects message count out of range", async () => {
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    const runner = new EvalRunner(factory as any, undefined as any);

    const result = await runner.runCase(
      makeCase({
        id: "msg-range",
        expected: { messagesCount: { min: 100, max: 200 } } satisfies ExpectedOutcome,
      }),
    );

    expect(result.outcomeDiff.messageCountOutOfRange).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Runtime errors are captured
  // -------------------------------------------------------------------------

  it("captures runtime errors from factory.create failure", async () => {
    const badFactory = {
      async create() {
        throw new Error("Factory failed to create runtime");
      },
      async teardown() {},
    };
    const runner = new EvalRunner(badFactory as any, undefined as any);

    const result = await runner.runCase(makeCase({ id: "runtime-err" }));

    expect(result.runtimeErrors.length).toBeGreaterThan(0);
    expect(result.runtimeErrors[0]).toContain("Factory failed");
    expect(result.passed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Score < 70 fails
  // -------------------------------------------------------------------------

  it("fails when score is below 70", async () => {
    const factory = createFakeRuntimeFactory({ stepCount: 2 });
    const runner = new EvalRunner(factory as any, undefined as any);

    // 4 missing tools: 100 - 40 = 60 < 70 → fails
    const result = await runner.runCase(
      makeCase({
        id: "low-score",
        expected: {
          toolsUsed: ["NonExistentToolA", "NonExistentToolB", "NonExistentToolC", "NonExistentToolD"],
        } satisfies ExpectedOutcome,
      }),
    );

    expect(result.score).toBeLessThan(70);
    expect(result.passed).toBe(false);
  });
});
