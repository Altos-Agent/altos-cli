import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";

const originalEnv = { ...process.env };

const applyAuthEnv = async () => {
  const dir = await mkdtemp(join(tmpdir(), "base-auth-security-"));
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

const loadBuildServer = async () => (await import("../server.js")).buildServer;

describe("local auth and CSRF integration", () => {
  beforeEach(async () => {
    await applyAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects unauthenticated mutating routes", async () => {
    const { db } = createInMemoryDb();
    const buildServer = await loadBuildServer();
    const server = await buildServer({ dbClient: db as never });

    const routes = [
      {
        method: "POST" as const,
        url: "/api/wallets/import",
        payload: { name: "Blocked", privateKey: "0x1234" },
      },
      {
        method: "PUT" as const,
        url: "/api/settings/telegram",
        payload: { enabled: false, chatId: null },
      },
      {
        method: "POST" as const,
        url: "/api/trades/execute-once",
        payload: { walletId: "wallet", pairId: "pair", sellAmountDisplay: "1" },
      },
      {
        method: "POST" as const,
        url: "/api/wallets/wallet/approve",
        payload: { tokenId: "token", routerId: "router", amount: "1" },
      },
      {
        method: "POST" as const,
        url: "/api/scheduler/start",
      },
    ];

    for (const route of routes) {
      const response = await server.inject(route);
      expect(response.statusCode).toBe(401);
    }

    await server.close();
  });

  it("requires CSRF on authenticated mutating routes", async () => {
    const { db } = createInMemoryDb();
    const buildServer = await loadBuildServer();
    const server = await buildServer({ dbClient: db as never });

    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "operator", password: "local-password" },
    });
    const cookie = authCookie(login.headers);

    const response = await server.inject({
      method: "PUT",
      url: "/api/settings/telegram",
      headers: { cookie },
      payload: { enabled: false, chatId: null },
    });

    expect(response.statusCode).toBe(403);
    await server.close();
  });

  it("allows authenticated requests with CSRF tokens", async () => {
    const { db } = createInMemoryDb();
    const buildServer = await loadBuildServer();
    const server = await buildServer({ dbClient: db as never });

    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "operator", password: "local-password" },
    });
    const cookie = authCookie(login.headers);
    const csrf = await server.inject({
      method: "GET",
      url: "/api/auth/csrf",
      headers: { cookie },
    });

    const response = await server.inject({
      method: "PUT",
      url: "/api/settings/telegram",
      headers: {
        cookie,
        "x-csrf-token": csrf.json().csrfToken,
      },
      payload: { enabled: false, chatId: null },
    });

    expect(response.statusCode).toBe(200);
    await server.close();
  });
});
