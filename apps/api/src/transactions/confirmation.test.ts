import { describe, expect, it } from "vitest";
import { mapReceiptToTransactionUpdate } from "./confirmation.js";

describe("transaction confirmation mapping", () => {
  it("maps a successful receipt to CONFIRMED and stores gas used", () => {
    expect(
      mapReceiptToTransactionUpdate({
        status: "success",
        gasUsed: 21000n
      })
    ).toEqual({
      status: "CONFIRMED",
      gasUsed: "21000",
      errorMessage: null
    });
  });

  it("maps a reverted receipt to FAILED with a clear error", () => {
    expect(
      mapReceiptToTransactionUpdate({
        status: "reverted",
        gasUsed: 45000n
      })
    ).toEqual({
      status: "FAILED",
      gasUsed: "45000",
      errorMessage: "Transaction reverted on-chain"
    });
  });
});
