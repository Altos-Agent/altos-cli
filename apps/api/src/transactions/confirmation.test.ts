import { describe, expect, it } from "vitest";
import {
  calculateConfirmationCount,
  evaluateMissingReceiptPolicy,
  mapReceiptToTransactionUpdate
} from "./confirmation.js";

describe("transaction confirmation mapping", () => {
  it("maps a successful receipt to pending finality until the required depth", () => {
    expect(
      mapReceiptToTransactionUpdate({
        receipt: {
          status: "success",
          gasUsed: 21000n,
          blockNumber: 100n
        },
        latestBlockNumber: 101n,
        confirmationsRequired: 3
      })
    ).toEqual({
      status: "CONFIRMED_PENDING_FINALITY",
      gasUsed: "21000",
      errorMessage: null,
      confirmationCount: 2,
      finalizedBlock: null
    });
  });

  it("finalizes a successful receipt only after the required confirmations", () => {
    expect(
      mapReceiptToTransactionUpdate({
        receipt: {
          status: "success",
          gasUsed: 21000n,
          blockNumber: 100n
        },
        latestBlockNumber: 102n,
        confirmationsRequired: 3
      })
    ).toEqual({
      status: "FINALIZED",
      gasUsed: "21000",
      errorMessage: null,
      confirmationCount: 3,
      finalizedBlock: "102"
    });
  });

  it("maps a reverted receipt to FAILED with a clear error", () => {
    expect(
      mapReceiptToTransactionUpdate({
        receipt: {
          status: "reverted",
          gasUsed: 45000n,
          blockNumber: 100n
        },
        latestBlockNumber: 100n,
        confirmationsRequired: 3
      })
    ).toEqual({
      status: "FAILED",
      gasUsed: "45000",
      errorMessage: "Transaction reverted on-chain",
      confirmationCount: 1,
      finalizedBlock: null
    });
  });

  it("never reports less than one confirmation once a receipt is available", () => {
    expect(calculateConfirmationCount(100n, 99n)).toBe(1);
  });

  it("marks missing receipts as stuck after the stuck timeout", () => {
    expect(
      evaluateMissingReceiptPolicy({
        submittedAt: new Date("2026-01-01T00:00:00.000Z"),
        now: new Date("2026-01-01T00:16:00.000Z"),
        stuckAfterMinutes: 15,
        droppedAfterMinutes: 60,
        nonce: 7,
        fromAddress: "0x0000000000000000000000000000000000000001"
      })
    ).toEqual({
      status: "STUCK",
      droppedReason:
        "Receipt unavailable after stuck timeout; replacement detection requires operator review for nonce 7",
      replacementDetection: "OPERATOR_REVIEW_REQUIRED"
    });
  });

  it("marks missing receipts as dropped after the dropped timeout", () => {
    expect(
      evaluateMissingReceiptPolicy({
        submittedAt: new Date("2026-01-01T00:00:00.000Z"),
        now: new Date("2026-01-01T01:01:00.000Z"),
        stuckAfterMinutes: 15,
        droppedAfterMinutes: 60,
        nonce: null,
        fromAddress: null
      })
    ).toEqual({
      status: "DROPPED",
      droppedReason:
        "Receipt unavailable after dropped timeout; transaction may be dropped or replaced and requires operator explorer/RPC review",
      replacementDetection: "NOT_AVAILABLE"
    });
  });
});
