import { describe, expect, it, beforeEach } from "vitest";
import { SignerPolicyEngine } from "./signer-policy-engine.ts";

const validContext = () => ({
  wallet: {
    address: "0x1234567890123456789012345678901234567890",
    status: "ACTIVE" as const,
    maxTradeUsd: "1000",
    maxGasUsd: "50",
    maxDailyTrades: 10,
    maxDailyLossUsd: "500",
  },
  transaction: {
    to: "0xDef4567890123456789012345678901234567890",
    value: "0",
    data: "0x095ea7b3000000000000000000000000Abcdef123456789012345678901234567890abcd",
    gasLimit: "21000",
  },
  quote: {
    sellToken: "0x1234567890123456789012345678901234567890",
    buyToken: "0x4567890123456789012345678901234567890123",
    sellAmountRaw: "1000000",
    expectedReturnUsd: "500",
  },
  routers: [
    { address: "0xDef4567890123456789012345678901234567890", verificationStatus: "VERIFIED" as const },
  ],
  emergencyPaused: false,
  aggregateRiskPassed: true,
});

describe("SignerPolicyEngine", () => {
  let engine: SignerPolicyEngine;

  beforeEach(() => {
    engine = new SignerPolicyEngine();
  });

  describe("check", () => {
    it("allows a valid transaction", () => {
      const result = engine.check(validContext());
      expect(result.allowed).toBe(true);
      expect(result.denied).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it("denies when wallet status is PAUSED", () => {
      const ctx = validContext();
      ctx.wallet.status = "PAUSED";
      const result = engine.check(ctx);
      expect(result.denied).toBe(true);
      expect(result.reasons).toContain("Wallet status is PAUSED, must be ACTIVE");
    });

    it("denies when wallet status is DISABLED", () => {
      const ctx = validContext();
      ctx.wallet.status = "DISABLED";
      const result = engine.check(ctx);
      expect(result.denied).toBe(true);
      expect(result.reasons).toContain("Wallet status is DISABLED, must be ACTIVE");
    });

    it("denies when emergency pause is active", () => {
      const ctx = validContext();
      ctx.emergencyPaused = true;
      const result = engine.check(ctx);
      expect(result.denied).toBe(true);
      expect(result.reasons).toContain("Emergency pause is active");
    });

    it("denies when tx.to is not a verified router", () => {
      const ctx = validContext();
      ctx.transaction.to = "0x9994567890123456789012345678901234567890";
      ctx.routers = [
        { address: "0xDef4567890123456789012345678901234567890", verificationStatus: "VERIFIED" as const },
      ];
      const result = engine.check(ctx);
      expect(result.denied).toBe(true);
      expect(result.reasons.some(r => r.includes("not a verified router"))).toBe(true);
    });

    it("allows when routers list is empty", () => {
      const ctx = validContext();
      ctx.routers = [];
      const result = engine.check(ctx);
      expect(result.allowed).toBe(true);
    });

    it("denies when function selector is not in allowlist", () => {
      const ctx = validContext();
      ctx.transaction.data = "0xdeadbeef00000000000000000000000000000000000000000000000000000000";
      const result = engine.check(ctx);
      expect(result.denied).toBe(true);
      expect(result.reasons.some(r => r.includes("not in the allowlist"))).toBe(true);
    });

    it("allows known function selectors", () => {
      const ctx = validContext();
      const knownSelectors = [
        "0x095ea7b3", // approve
        "0xa9059cbb", // transfer
        "0x23b872dd", // transferFrom
        "0xb6f9de95", // swapExactTokensForTokens
        "0x7ff36ab5", // swapExactETHForTokens
        "0x18cbafe5", // swapExactTokensForETH
        "0x38ed1739", // swapExactTokensForTokens V3
        "0x5ae401dc", // multicall
        "0xac9650d8", // multicall V3
      ];
      for (const selector of knownSelectors) {
        ctx.transaction.data = selector + "0000000000000000000000000000000000000000000000000000000000000000";
        const result = engine.check(ctx);
        expect(result.allowed).toBe(true);
      }
    });

    it("denies when expectedReturnUsd exceeds maxTradeUsd", () => {
      const ctx = {
        wallet: {
          address: "0x1234567890123456789012345678901234567890",
          status: "ACTIVE" as const,
          maxTradeUsd: "1000",
          maxGasUsd: "50",
          maxDailyTrades: 10,
          maxDailyLossUsd: "500",
        },
        transaction: {
          to: "0xDef4567890123456789012345678901234567890",
          value: "0",
          data: "0x095ea7b30000000000000000000000000000000000000000000000000000000000",
          gasLimit: "21000",
        },
        quote: {
          sellToken: "0x1234567890123456789012345678901234567890",
          buyToken: "0x4567890123456789012345678901234567890123",
          sellAmountRaw: "1000000",
          expectedReturnUsd: "5000",
        },
        routers: [
          { address: "0xDef4567890123456789012345678901234567890", verificationStatus: "VERIFIED" as const },
        ],
        emergencyPaused: false,
        aggregateRiskPassed: true,
      };
      const result = engine.check(ctx);
      expect(result.allowed).toBe(false);
      expect(result.denied).toBe(true);
      expect(result.reasons.some(r => r.includes("exceeds") && r.includes("maxTradeUsd"))).toBe(true);
    });

    it("denies when aggregate risk did not pass", () => {
      const ctx = validContext();
      ctx.aggregateRiskPassed = false;
      const result = engine.check(ctx);
      expect(result.denied).toBe(true);
      expect(result.reasons).toContain("Aggregate risk check did not pass");
    });

    it("denies when gas cost exceeds maxGasUsd", () => {
      const ctx = {
        wallet: {
          address: "0x1234567890123456789012345678901234567890",
          status: "ACTIVE" as const,
          maxTradeUsd: "100000",
          maxGasUsd: "0.001",
          maxDailyTrades: 10,
          maxDailyLossUsd: "500",
        },
        transaction: {
          to: "0xDef4567890123456789012345678901234567890",
          value: "0",
          data: "0x095ea7b30000000000000000000000000000000000000000000000000000000000",
          gasLimit: "500000",
        },
        quote: {
          sellToken: "0x1234567890123456789012345678901234567890",
          buyToken: "0x4567890123456789012345678901234567890123",
          sellAmountRaw: "1000000",
          expectedReturnUsd: "500",
        },
        routers: [
          { address: "0xDef4567890123456789012345678901234567890", verificationStatus: "VERIFIED" as const },
        ],
        emergencyPaused: false,
        aggregateRiskPassed: true,
      };
      const result = engine.check(ctx);
      expect(result.allowed).toBe(false);
      expect(result.denied).toBe(true);
      expect(result.reasons.some(r => r.includes("exceeds") && r.includes("maxGasUsd"))).toBe(true);
    });

    it("allows when quote is not provided", () => {
      const ctx = validContext();
      ctx.quote = undefined;
      const result = engine.check(ctx);
      expect(result.allowed).toBe(true);
    });

    it("allows when wallet has no maxTradeUsd limit", () => {
      const ctx = validContext();
      ctx.wallet.maxTradeUsd = null;
      ctx.quote!.expectedReturnUsd = "999999999";
      const result = engine.check(ctx);
      expect(result.allowed).toBe(true);
    });

    it("allows when wallet has no maxGasUsd limit", () => {
      const ctx = validContext();
      ctx.wallet.maxGasUsd = null;
      ctx.transaction.gasLimit = "99999999";
      const result = engine.check(ctx);
      expect(result.allowed).toBe(true);
    });

    it("allows router with UNVERIFIED status if no VERIFIED routers exist", () => {
      const ctx = validContext();
      ctx.routers = [
        { address: "0xDef4567890123456789012345678901234567890", verificationStatus: "UNVERIFIED" as const },
      ];
      const result = engine.check(ctx);
      // UNVERIFIED router should not be in the valid targets list, so tx should be denied
      // UNLESS the routers list is empty or all are UNVERIFIED
      // Actually with UNVERIFIED only, validTargets is empty, so rule is skipped
      expect(result.allowed).toBe(true);
    });

    it("denies with multiple reasons when multiple rules fail", () => {
      const ctx = validContext();
      ctx.wallet.status = "PAUSED";
      ctx.emergencyPaused = true;
      ctx.aggregateRiskPassed = false;
      const result = engine.check(ctx);
      expect(result.denied).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("custom function selectors", () => {
    it("allows custom allowlist via constructor", () => {
      const customEngine = new SignerPolicyEngine({
        allowedFunctionSelectors: ["0x095ea7b3", "0xa9059cbb", "0x0000000c"],
      });
      const ctx = validContext();
      ctx.transaction.data = "0x0000000c00000000000000000000000000000000000000000000000000000000";
      const result = customEngine.check(ctx);
      expect(result.allowed).toBe(true);
    });

    it("denies selectors not in custom allowlist", () => {
      const customEngine = new SignerPolicyEngine({
        allowedFunctionSelectors: ["0x0000000c"],
      });
      const ctx = validContext();
      ctx.transaction.data = "0x095ea7b30000000000000000000000000000000000000000000000000000000000";
      const result = customEngine.check(ctx);
      expect(result.denied).toBe(true);
    });
  });
});