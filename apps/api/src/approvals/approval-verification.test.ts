import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryDb, type InMemoryTables } from "../test-utils/in-memory-db.js";
import { createApprovalService } from "./approval-service.js";

const originalEnv = { ...process.env };
const now = new Date("2026-01-01T00:00:00.000Z");

const applyEnv = () => {
  process.env.NODE_ENV = "test";
  process.env.BASE_CHAIN_ID = "8453";
  process.env.BASE_RPC_URL = "https://mainnet.base.org";
  process.env.BASESCAN_BASE_URL = "https://basescan.org";
  process.env.DRY_RUN = "true";
  process.env.DEMO_MODE = "true";
  process.env.REQUIRE_LIVE_CONFIRMATION = "true";
  process.env.ALLOW_UNLIMITED_APPROVAL = "false";
};

const verifiedEvidence = {
  verificationStatus: "VERIFIED",
  verificationSource: "Basescan",
  verificationEvidenceUrl: "https://basescan.org/address/0x0000000000000000000000000000000000000002",
  verifiedAt: now,
  verifiedBy: "operator",
  verificationNotes: "checked",
};

const seed = (
  overrides: {
    token?: Record<string, unknown>;
    router?: Record<string, unknown>;
  } = {},
): Partial<InMemoryTables> => ({
  wallets: [
    {
      id: "wallet-1",
      name: "Wallet",
      address: "0x0000000000000000000000000000000000000001",
      encryptedPrivateKey: "encrypted",
      encryptionVersion: 1,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
  ],
  tokens: [
    {
      id: "token-1",
      chainId: 8453,
      symbol: "USDC",
      name: "USD Coin",
      address: "0x0000000000000000000000000000000000000101",
      checksumAddress: "0x0000000000000000000000000000000000000101",
      decimals: 6,
      riskLevel: "LOW",
      enabled: true,
      ...verifiedEvidence,
      ...overrides.token,
    },
  ],
  routers: [
    {
      id: "router-1",
      chainId: 8453,
      name: "0x",
      address: "0x0000000000000000000000000000000000000201",
      checksumAddress: "0x0000000000000000000000000000000000000201",
      spenderAddress: "0x0000000000000000000000000000000000000201",
      allowanceTargetAddress: "0x0000000000000000000000000000000000000201",
      txTargetAddress: "0x0000000000000000000000000000000000000201",
      enabled: true,
      riskLevel: "LOW",
      ...verifiedEvidence,
      ...overrides.router,
    },
  ],
});

describe("approval verified registry gates", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects approve when token is not VERIFIED", async () => {
    applyEnv();
    const { db } = createInMemoryDb(
      seed({ token: { verificationStatus: "UNVERIFIED" } }),
    );
    const service = createApprovalService(db as never);

    await expect(
      service.approve("wallet-1", {
        tokenId: "token-1",
        routerId: "router-1",
        amount: "1",
        confirmLiveExecution: true,
      }),
    ).rejects.toThrow("Token USDC is not verified");
  });

  it("rejects revoke when router/spender is not VERIFIED", async () => {
    applyEnv();
    const { db } = createInMemoryDb(
      seed({
        router: {
          verificationStatus: "UNVERIFIED",
        },
      }),
    );
    const service = createApprovalService(db as never);

    await expect(
      service.revoke("wallet-1", {
        tokenId: "token-1",
        routerId: "router-1",
        confirmLiveExecution: true,
      }),
    ).rejects.toThrow("Router 0x is not verified");
  });
});
