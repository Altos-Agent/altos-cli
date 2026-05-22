import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import type { ScheduleOccurrence } from "../db/schema.js";

type TestDb = ReturnType<typeof createInMemoryDb>["db"];

const createTestDb = () => {
  const result = createInMemoryDb();
  return result.db;
};

const cleanTestDb = async (_db: TestDb) => {
  // No cleanup needed for in-memory
};

describe("scheduler pre-sign gate", () => {
  let db: TestDb;

  beforeEach(async () => { db = createTestDb(); });
  afterEach(async () => { await cleanTestDb(db); });

  const makeOccurrence = (overrides: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence =>
    ({
      id: "occ-test-123",
      scheduleId: "sched-123",
      walletId: "wallet-123",
      pairId: "pair-123",
      strategyProfileId: null,
      mode: "LIVE_CANARY",
      scheduledFor: new Date(),
      occurrenceKey: "occ_key_1",
      idempotencyKey: "idem_key_1",
      status: "RUNNING",
      requestId: null,
      traceId: "trace-123",
      quoteHash: null,
      simulationHash: null,
      transactionId: null,
      jobId: "job-123",
      attemptCount: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      riskReservationId: null,
      nonceReservationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as ScheduleOccurrence);

  it("should block LIVE mode immediately", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");
    const liveOccurrence = makeOccurrence({ mode: "LIVE" });
    const result = await evaluatePreSignGates(liveOccurrence, db);
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0].code).toBe("LIVE_MODE_BLOCKED");
  });

  it("should allow DRY_RUN mode to skip gates", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");
    const dryRunOccurrence = makeOccurrence({ mode: "DRY_RUN" });
    const result = await evaluatePreSignGates(dryRunOccurrence, db);
    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toHaveLength(0);
  });

  it("should block LIVE_CANARY when all gates are stubs (all return BLOCKED)", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");
    const result = await evaluatePreSignGates(makeOccurrence(), db);
    // All stubs return BLOCKED, so LIVE_CANARY should be blocked
    expect(result.allowed).toBe(false);
    expect(result.blockedReasons.length).toBeGreaterThan(0);
    // All blocked reasons should have gate, code, message
    for (const reason of result.blockedReasons) {
      expect(reason.gate).toBeTruthy();
      expect(reason.code).toBeTruthy();
      expect(reason.message).toBeTruthy();
    }
  });

  it("should record every gate that failed in blockedReasons", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");
    const result = await evaluatePreSignGates(makeOccurrence(), db);
    // At minimum, readiness, rbac, signer, registry, quote, simulation should all be stubbed BLOCKED
    const gateNames = result.blockedReasons.map(r => r.gate);
    expect(gateNames).toContain("readinessCheck");
    expect(gateNames).toContain("rbacReauthMfaCheck");
  });
});