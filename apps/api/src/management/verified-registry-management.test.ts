import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { createManagementService } from "./management-service.js";

const now = new Date("2026-01-01T00:00:00.000Z");

const evidence = {
  verificationStatus: "VERIFIED" as const,
  verificationSource: "Basescan",
  verificationEvidenceUrl: "https://basescan.org/token/0x0000000000000000000000000000000000000101",
  verifiedBy: "operator",
  verificationNotes: "contract, decimals, and source checked",
};

describe("verified registry management rules", () => {
  it("requires evidence before marking a token VERIFIED", async () => {
    const { db } = createInMemoryDb({
      tokens: [
        {
          id: "token-1",
          chainId: 8453,
          symbol: "USDC",
          name: "USD Coin",
          address: "0x0000000000000000000000000000000000000101",
          decimals: 6,
          riskLevel: "LOW",
          enabled: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const service = createManagementService(db as never);

    await expect(
      service.updateToken("token-1", { verificationStatus: "VERIFIED" }),
    ).rejects.toThrow("VERIFIED status requires");

    const token = await service.updateToken("token-1", evidence);
    expect(token.verificationStatus).toBe("VERIFIED");
    expect(token.verifiedAt).toBeInstanceOf(Date);
  });

  it("resets token verification when address changes without re-verification", async () => {
    const { db } = createInMemoryDb({
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
          ...evidence,
          verifiedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const service = createManagementService(db as never);

    const token = await service.updateToken("token-1", {
      address: "0x0000000000000000000000000000000000000102",
    });

    expect(token.verificationStatus).toBe("UNVERIFIED");
    expect(token.verificationEvidenceUrl).toBeNull();
    expect(token.verifiedAt).toBeNull();
  });

  it("requires fresh evidence when changing a verified token address and re-verifying", async () => {
    const { db } = createInMemoryDb({
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
          ...evidence,
          verifiedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const service = createManagementService(db as never);

    await expect(
      service.updateToken("token-1", {
        address: "0x0000000000000000000000000000000000000102",
        verificationStatus: "VERIFIED",
      }),
    ).rejects.toThrow("VERIFIED status requires");
  });


  it("blocks enabling placeholder routers", async () => {
    const { db } = createInMemoryDb({
      routers: [
        {
          id: "router-1",
          chainId: 8453,
          name: "Demo Router",
          address: "0x0000000000000000000000000000000000000201",
          enabled: false,
          riskLevel: "LOW",
          verificationStatus: "PLACEHOLDER",
          notes: "demo",
        },
      ],
    });
    const service = createManagementService(db as never);

    await expect(service.setRouterEnabled("router-1", true)).rejects.toThrow(
      "PLACEHOLDER records cannot be enabled",
    );
  });
});
