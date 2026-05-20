import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";

const originalEnv = { ...process.env };

const applyEnv = async () => {
  const dir = await mkdtemp(join(tmpdir(), "base-ops-summary-"));
  process.env.NODE_ENV = "test";
  process.env.BASE_CHAIN_ID = "8453";
  process.env.BASE_RPC_URL = "https://mainnet.base.org";
  process.env.BASESCAN_BASE_URL = "https://basescan.org";
  process.env.DRY_RUN = "true";
  process.env.DEMO_MODE = "true";
  process.env.REQUIRE_LIVE_CONFIRMATION = "true";
  process.env.ALLOW_UNLIMITED_APPROVAL = "false";
  process.env.AUTO_APPROVE = "false";
  process.env.SCHEDULER_LIVE_EXECUTION = "false";
  process.env.QUOTE_PROVIDER = "mock";
  process.env.TELEGRAM_ENABLED = "false";
  process.env.REDIS_URL = "redis://localhost:6379";
  process.env.DATABASE_URL =
    "postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator";
  process.env.OPERATOR_USERNAME = "operator";
  process.env.OPERATOR_PASSWORD = "local-password";
  process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.MASTER_KEY_FILE = join(dir, "master.key");
};

const authCookie = (
  headers: Record<string, string | string[] | number | undefined>
) => {
  const setCookie = headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return typeof cookie === "string" ? cookie : undefined;
};

describe("ops summary route", () => {
  beforeEach(async () => {
    await applyEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns runtime, vault, emergency pause, and notification failure counts", async () => {
    const { db } = createInMemoryDb({
      localSettings: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          globalEmergencyPaused: true,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ],
      notificationDeliveries: [
        {
          id: "delivery-1",
          channel: "telegram",
          eventType: "transaction failed",
          status: "FAILED",
          requestId: "req-1",
          jobId: null,
          walletId: null,
          transactionId: null,
          destinationPreview: "chat:123",
          errorCode: "TELEGRAM_SEND_FAILED",
          errorMessage: "redacted",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ],
      transactions: [
        {
          id: "tx-1",
          walletId: "wallet-1",
          pairId: null,
          chainId: 8453,
          status: "SUBMITTED",
          action: "SWAP",
          txHash: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        },
        {
          id: "tx-2",
          walletId: "wallet-1",
          pairId: null,
          chainId: 8453,
          status: "FAILED",
          action: "SWAP",
          txHash: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z")
        }
      ]
    });
    const server = await buildServer({ dbClient: db as never });
    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "operator", password: "local-password" }
    });

    const response = await server.inject({
      method: "GET",
      url: "/api/ops/summary",
      headers: { cookie: authCookie(login.headers) }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notificationFailuresCount: 1,
      submittedTxCount: 1,
      failedTxCount: 1,
      emergencyPauseStatus: { globalEmergencyPaused: true },
      vaultStatus: { status: "LOCKED" },
      runtimeStatus: {
        demoMode: true,
        dryRun: true,
        emergencyPaused: true
      }
    });
    await server.close();
  });
});
