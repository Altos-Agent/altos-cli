import { describe, expect, it } from "vitest";
import {
  maxUint256String,
  parseApprovalAmount,
  validateApprovalAmount
} from "./approval-policy.js";

describe("approval policy", () => {
  it("parses a human token amount into exact raw units", () => {
    expect(parseApprovalAmount("1.25", 6)).toBe("1250000");
  });

  it("rejects zero and negative approvals", () => {
    expect(validateApprovalAmount({ rawAmount: "0" })).toContain(
      "Approval amount must be greater than zero"
    );
    expect(validateApprovalAmount({ rawAmount: "-1" })).toContain(
      "Approval amount must be greater than zero"
    );
  });

  it("rejects unlimited approval unless explicitly enabled", () => {
    expect(
      validateApprovalAmount({
        rawAmount: maxUint256String,
        allowUnlimitedApproval: false
      })
    ).toContain("Unlimited approval is disabled");
  });
});
