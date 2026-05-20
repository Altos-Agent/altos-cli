import { describe, expect, it } from "vitest";
import { parseRuntimeEnv } from "./env.js";

const validEnv = {
  NODE_ENV: "development",
  API_PORT: "4100",
  WEB_PORT: "3100",
  DATABASE_URL:
    "postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator",
  REDIS_URL: "redis://localhost:6379",
  BASE_CHAIN_ID: "8453",
  BASE_RPC_URL: "https://mainnet.base.org",
  BASESCAN_BASE_URL: "https://basescan.org",
  DRY_RUN: "true",
  DEMO_MODE: "true",
  REQUIRE_LIVE_CONFIRMATION: "true",
  ALLOW_UNLIMITED_APPROVAL: "false",
  AUTO_APPROVE: "false",
  SCHEDULER_LIVE_EXECUTION: "false",
  QUOTE_PROVIDER: "mock",
  MASTER_KEY_FILE: ".local/master.key",
  TELEGRAM_ENABLED: "false",
  OPERATOR_USERNAME: "operator",
  OPERATOR_PASSWORD: "local-password",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
};

describe("OPERATOR_ROLE env", () => {
  it("accepts valid role values", () => {
    const result = parseRuntimeEnv({
      NODE_ENV: "development",
      OPERATOR_ROLE: "admin",
      OPERATOR_PASSWORD: "test",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    });
    expect(result.operatorRole).toBe("admin");
  });

  it("rejects invalid role value", () => {
    expect(() =>
      parseRuntimeEnv({
        NODE_ENV: "development",
        OPERATOR_ROLE: "superadmin",
        OPERATOR_PASSWORD: "test",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef",
      })
    ).toThrow();
  });
});

describe("SESSION_TTL_SECONDS env", () => {
  it("accepts valid values", () => {
    const result = parseRuntimeEnv({
      NODE_ENV: "development",
      OPERATOR_PASSWORD: "test",
      SESSION_SECRET: "0123456789abcdef0123456789abcdef",
      SESSION_TTL_SECONDS: "3600",
    });
    expect(result.sessionTtlSeconds).toBe(3600);
  });

  it("rejects below minimum", () => {
    expect(() =>
      parseRuntimeEnv({
        NODE_ENV: "development",
        OPERATOR_PASSWORD: "test",
        SESSION_SECRET: "0123456789abcdef0123456789abcdef",
        SESSION_TTL_SECONDS: "100",
      })
    ).toThrow();
  });
});

describe("runtime env validation", () => {
  it("parses safe local defaults", () => {
    const config = parseRuntimeEnv(validEnv);

    expect(config.dryRun).toBe(true);
    expect(config.demoMode).toBe(true);
    expect(config.baseChainId).toBe(8453);
    expect(config.quoteProvider).toBe("mock");
  });

  it("rejects non-Base chain IDs", () => {
    expect(() =>
      parseRuntimeEnv({ ...validEnv, BASE_CHAIN_ID: "1" }),
    ).toThrow(/BASE_CHAIN_ID/);
  });

  it("rejects demo mode without dry-run", () => {
    expect(() =>
      parseRuntimeEnv({ ...validEnv, DEMO_MODE: "true", DRY_RUN: "false" }),
    ).toThrow(/DEMO_MODE=true requires DRY_RUN=true/);
  });

  it("rejects live scheduler while dry-run is enabled", () => {
    expect(() =>
      parseRuntimeEnv({
        ...validEnv,
        SCHEDULER_LIVE_EXECUTION: "true",
        DRY_RUN: "true",
      }),
    ).toThrow(/SCHEDULER_LIVE_EXECUTION=true requires DRY_RUN=false/);
  });

  it("rejects production startup without password hash", () => {
    const envWithoutPassword: Record<string, string> = { ...validEnv };
    delete envWithoutPassword.OPERATOR_PASSWORD;

    expect(() =>
      parseRuntimeEnv({
        ...envWithoutPassword,
        NODE_ENV: "production",
      }),
    ).toThrow(/OPERATOR_PASSWORD_HASH/);
  });

  it("rejects production startup with plaintext operator password", () => {
    expect(() =>
      parseRuntimeEnv({
        ...validEnv,
        NODE_ENV: "production",
        OPERATOR_PASSWORD_HASH:
          "$argon2id$v=19$m=65536,t=3,p=1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        OPERATOR_PASSWORD: "local-password",
      }),
    ).toThrow(/OPERATOR_PASSWORD is local development only/);
  });

  it("rejects malformed operator password hashes", () => {
    expect(() =>
      parseRuntimeEnv({
        ...validEnv,
        OPERATOR_PASSWORD_HASH: "not-a-password-hash",
      }),
    ).toThrow(/Argon2id encoded hash/);
  });
});
