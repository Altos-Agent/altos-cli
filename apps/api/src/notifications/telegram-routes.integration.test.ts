import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { resetLocalRateLimits } from "../http/rate-limit.js";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";

const originalEnv = { ...process.env };

const applyEnv = async () => {
  const dir = await mkdtemp(join(tmpdir(), "base-telegram-routes-"));
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
  headers: Record<string, string | string[] | number | undefined>,
) => {
  const setCookie = headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return typeof cookie === "string" ? cookie : undefined;
};

const authenticated = async (
  server: Awaited<ReturnType<typeof buildServer>>,
) => {
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
  return {
    cookie,
    csrfToken: csrf.json<{ csrfToken: string }>().csrfToken,
  };
};

describe("telegram routes observability", () => {
  beforeEach(async () => {
    await applyEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetLocalRateLimits();
  });

  it("returns a request ID header on API responses", async () => {
    const { db } = createInMemoryDb();
    const server = await buildServer({ dbClient: db as never });
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    await server.close();
  });

  it("rate limits Telegram test sends locally", async () => {
    const { db, tables } = createInMemoryDb();
    const server = await buildServer({ dbClient: db as never });
    const { cookie, csrfToken } = await authenticated(server);

    let lastStatus = 0;
    let firstRequestId: string | string[] | number | undefined;
    for (let index = 0; index < 6; index += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/api/settings/telegram/test",
        headers: {
          cookie,
          "x-csrf-token": csrfToken,
        },
      });
      lastStatus = response.statusCode;
      firstRequestId ??= response.headers["x-request-id"];
    }

    expect(lastStatus).toBe(429);
    expect(tables.notificationDeliveries[0]).toEqual(
      expect.objectContaining({
        eventType: "test notification",
        status: "SKIPPED",
        requestId: firstRequestId,
      }),
    );
    await server.close();
  });
});
