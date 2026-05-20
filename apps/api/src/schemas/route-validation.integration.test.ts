import Fastify from "fastify";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { registerManagementRoutes } from "../management/management-routes.js";
import { registerPlanRoutes } from "../strategy/plan-routes.js";
import { buildServer } from "../server.js";

const originalEnv = { ...process.env };

const applyAuthEnv = async () => {
  const dir = await mkdtemp(join(tmpdir(), "base-route-validation-"));
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

const authCookie = (headers: Record<string, string | string[] | number | undefined>) => {
  const setCookie = headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return typeof cookie === "string" ? cookie : undefined;
};

const loginWithCsrf = async (server: FastifyInstance) => {
  const login = await server.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "operator", password: "local-password" }
  });
  const cookie = authCookie(login.headers);
  const csrf = await server.inject({
    method: "GET",
    url: "/api/auth/csrf",
    headers: { cookie }
  });

  return {
    cookie,
    csrfToken: csrf.json<{ csrfToken: string }>().csrfToken
  };
};

describe("route request validation", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects invalid token decimals before creating a token", async () => {
    const { db, tables } = createInMemoryDb();
    const server = Fastify({ logger: false });
    await registerManagementRoutes(server, db as never);

    const response = await server.inject({
      method: "POST",
      url: "/api/tokens",
      payload: {
        symbol: "BAD",
        name: "Bad Token",
        address: "0x0000000000000000000000000000000000000001",
        decimals: 99,
        chainId: 8453
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Invalid request body");
    expect(tables.tokens).toHaveLength(0);

    await server.close();
  });

  it("rejects malformed dry-run bodies before service code", async () => {
    const { db, tables } = createInMemoryDb();
    const server = Fastify({ logger: false });
    await registerPlanRoutes(server, db as never);

    const response = await server.inject({
      method: "POST",
      url: "/api/plans/dry-run",
      payload: {
        walletId: "wallet-1",
        pairId: "pair-1",
        sellAmountDisplay: "1e-3",
        mode: "DRY_RUN_ONLY"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Invalid request body");
    expect(tables.transactions).toHaveLength(0);

    await server.close();
  });

  it("rejects same-token pairs and negative limits", async () => {
    const { db } = createInMemoryDb();
    const server = Fastify({ logger: false });
    await registerManagementRoutes(server, db as never);

    const response = await server.inject({
      method: "POST",
      url: "/api/pairs",
      payload: {
        chainId: 8453,
        tokenInId: "token-a",
        tokenOutId: "token-a",
        maxTradeUsd: "-1"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Invalid request body");

    await server.close();
  });

  it("rejects invalid auth login bodies before credential checks", async () => {
    await applyAuthEnv();
    const { db } = createInMemoryDb();
    const server = await buildServer({ dbClient: db as never });

    const response = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "", password: 123 }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Invalid request body");
    await server.close();
  });

  it("rejects invalid vault unlock bodies before vault logic", async () => {
    await applyAuthEnv();
    const { db } = createInMemoryDb();
    const server = await buildServer({ dbClient: db as never });
    const auth = await loginWithCsrf(server);

    const response = await server.inject({
      method: "POST",
      url: "/api/vault/unlock",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken
      },
      payload: { username: "operator", password: 123 }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Invalid request body");
    await server.close();
  });

  it("rejects invalid encrypted backup imports before service logic", async () => {
    await applyAuthEnv();
    const { db } = createInMemoryDb();
    const server = await buildServer({ dbClient: db as never });
    const auth = await loginWithCsrf(server);

    const response = await server.inject({
      method: "POST",
      url: "/api/wallets/bulk/import-encrypted",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken
      },
      payload: { rotateKeys: false }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Invalid request body");
    await server.close();
  });

  it("rejects invalid route params and unexpected bodies on bodyless mutating routes", async () => {
    await applyAuthEnv();
    const { db } = createInMemoryDb();
    const server = await buildServer({ dbClient: db as never });
    const auth = await loginWithCsrf(server);

    const invalidParam = await server.inject({
      method: "GET",
      url: "/api/wallets/bad%20id",
      headers: { cookie: auth.cookie }
    });
    const unexpectedBody = await server.inject({
      method: "POST",
      url: "/api/scheduler/start",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken
      },
      payload: { unexpected: true }
    });

    expect(invalidParam.statusCode).toBe(400);
    expect(unexpectedBody.statusCode).toBe(400);
    expect(unexpectedBody.json().error).toContain("Invalid request body");
    await server.close();
  });
});
