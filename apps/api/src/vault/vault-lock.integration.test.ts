import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";

const originalEnv = { ...process.env };

const setupLiveEnv = async () => {
  const dir = await mkdtemp(join(tmpdir(), "base-vault-lock-"));
  process.env.NODE_ENV = "test";
  process.env.BASE_CHAIN_ID = "8453";
  process.env.BASE_RPC_URL = "https://mainnet.base.org";
  process.env.BASESCAN_BASE_URL = "https://basescan.org";
  process.env.DRY_RUN = "false";
  process.env.DEMO_MODE = "false";
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

const loadBuildServer = async () => (await import("../server.js")).buildServer;

const loginWithCsrf = async (server: FastifyInstance) => {
  const login = await server.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "operator", password: "local-password" },
  });
  const setCookie = login.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const csrf = await server.inject({
    method: "GET",
    url: "/api/auth/csrf",
    headers: { cookie },
  });

  return {
    cookie,
    csrfToken: csrf.json().csrfToken as string,
  };
};

describe("vault lock integration", () => {
  beforeEach(async () => {
    await setupLiveEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does not require vault unlock for dry-run planning", async () => {
    process.env.DRY_RUN = "true";
    process.env.DEMO_MODE = "true";
    const { db } = createInMemoryDb();
    const buildServer = await loadBuildServer();
    const server = await buildServer({ dbClient: db as never });
    const auth = await loginWithCsrf(server);

    const response = await server.inject({
      method: "POST",
      url: "/api/plans/dry-run",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: {
        walletId: "missing",
        pairId: "missing",
        sellAmountDisplay: "1",
        mode: "DRY_RUN_ONLY"
      },
    });

    expect(response.statusCode).not.toBe(423);
    await server.close();
  });

  it("rejects live signing routes while the vault is locked", async () => {
    const { db } = createInMemoryDb();
    const buildServer = await loadBuildServer();
    const server = await buildServer({ dbClient: db as never });
    const auth = await loginWithCsrf(server);

    const approval = await server.inject({
      method: "POST",
      url: "/api/wallets/wallet/approve",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: { tokenId: "token", routerId: "router", amount: "1" },
    });
    const execute = await server.inject({
      method: "POST",
      url: "/api/trades/execute-once",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: { walletId: "wallet", pairId: "pair", sellAmountDisplay: "1" },
    });

    expect(approval.statusCode).toBe(423);
    expect(execute.statusCode).toBe(423);
    await server.close();
  });
});
