import { describe, expect, it, beforeEach, fail } from "vitest";
import { SigningCoordinator } from "./signing-coordinator.ts";
import { SignerPolicyEngine } from "./policy/signer-policy-engine.ts";
import { SignerPolicyError } from "./providers/base.js";
import type { CustodyProvider, SignRequest, SignResult } from "./providers/base.js";

// Mock custody provider
class MockCustodyProvider implements CustodyProvider {
  readonly providerType = "mock" as const;
  signCalled = false;
  signRequest: SignRequest | null = null;
  shouldFail = false;

  isConfigured(): boolean { return true; }
  getSafetyLevel() { return "PRODUCTION" as const; }
  supportsPolicy(): boolean { return true; }
  getWarning(): string | null { return null; }

  async signTransaction(request: SignRequest): Promise<SignResult> {
    this.signCalled = true;
    this.signRequest = request;
    if (this.shouldFail) {
      throw new Error("Mock signing failed");
    }
    return {
      v: 27,
      r: "0x" + "a".repeat(64),
      s: "0x" + "b".repeat(64),
    };
  }
}

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

describe("SigningCoordinator", () => {
  let mockProvider: MockCustodyProvider;
  let policyEngine: SignerPolicyEngine;
  let coordinator: SigningCoordinator;

  beforeEach(() => {
    mockProvider = new MockCustodyProvider();
    policyEngine = new SignerPolicyEngine();
    coordinator = new SigningCoordinator(mockProvider, policyEngine);
  });

  describe("signTransaction", () => {
    it("allows transaction that passes policy check", async () => {
      const signRequest: SignRequest = {
        from: "0x1234567890123456789012345678901234567890",
        to: "0xDef4567890123456789012345678901234567890",
        value: "0",
        data: "0x095ea7b3000000000000000000000000Abcdef123456789012345678901234567890abcd",
        gasLimit: "21000",
        chainId: 8453,
      };

      const result = await coordinator.signTransaction({
        signRequest,
        policyContext: validContext(),
        dryRun: false,
      });

      expect(mockProvider.signCalled).toBe(true);
      expect(result.v).toBe(27);
    });

    it("denies transaction that fails policy check", async () => {
      const ctx = validContext();
      ctx.wallet.status = "PAUSED"; // Will fail policy

      await expect(coordinator.signTransaction({
        signRequest: {
          from: "0x1234567890123456789012345678901234567890",
          to: "0xDef4567890123456789012345678901234567890",
          value: "0",
          data: "0x095ea7b3",
          gasLimit: "21000",
          chainId: 8453,
        },
        policyContext: ctx,
        dryRun: false,
      })).rejects.toThrow(SignerPolicyError);
    });

    it("passes correct reasons to SignerPolicyError", async () => {
      const ctx = validContext();
      ctx.wallet.status = "DISABLED";
      ctx.emergencyPaused = true;

      try {
        await coordinator.signTransaction({
          signRequest: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0xDef4567890123456789012345678901234567890",
            value: "0",
            data: "0x095ea7b3",
            gasLimit: "21000",
            chainId: 8453,
          },
          policyContext: ctx,
          dryRun: false,
        });
        fail("Expected SignerPolicyError to be thrown");
      } catch (error) {
        if (error instanceof SignerPolicyError) {
          expect(error.reasons.length).toBeGreaterThanOrEqual(2);
          expect(error.reasons).toContain("Wallet status is DISABLED, must be ACTIVE");
          expect(error.reasons).toContain("Emergency pause is active");
        } else {
          throw error;
        }
      }
    });

    it("does not call custody provider signTransaction when policy denies", async () => {
      const ctx = validContext();
      ctx.wallet.status = "DISABLED";

      try {
        await coordinator.signTransaction({
          signRequest: {
            from: "0x1234567890123456789012345678901234567890",
            to: "0xDef4567890123456789012345678901234567890",
            value: "0",
            data: "0x095ea7b3",
            gasLimit: "21000",
            chainId: 8453,
          },
          policyContext: ctx,
          dryRun: false,
        });
      } catch {
        // Expected
      }

      expect(mockProvider.signCalled).toBe(false);
    });

    it("signTransaction passes correct request to custody provider", async () => {
      const signRequest: SignRequest = {
        from: "0x1234567890123456789012345678901234567890",
        to: "0xDef4567890123456789012345678901234567890",
        value: "1000000000000000000",
        data: "0x095ea7b3000000000000000000000000Abcdef123456789012345678901234567890abcd",
        gasLimit: "100000",
        chainId: 8453,
        nonce: 5,
      };

      await coordinator.signTransaction({
        signRequest,
        policyContext: validContext(),
        dryRun: false,
      });

      expect(mockProvider.signRequest).not.toBeNull();
      expect(mockProvider.signRequest!.from).toBe("0x1234567890123456789012345678901234567890");
      expect(mockProvider.signRequest!.to).toBe("0xDef4567890123456789012345678901234567890");
      expect(mockProvider.signRequest!.value).toBe("1000000000000000000");
      expect(mockProvider.signRequest!.nonce).toBe(5);
    });
  });
});