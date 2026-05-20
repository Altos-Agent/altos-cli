import { describe, expect, it, vi } from "vitest";
import { parseRuntimeEnv } from "../config/env.js";
import {
  hashOperatorPassword,
  isLegacySha256PasswordHash,
  verifyOperatorPassword,
  verifyPassword,
} from "./password.js";

const baseConfig = parseRuntimeEnv({
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
});

describe("operator password hashing", () => {
  it("hashes and verifies operator passwords with Argon2id", async () => {
    const hash = await hashOperatorPassword("correct horse battery staple");

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPassword(hash, "correct horse battery staple"),
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashOperatorPassword("correct horse battery staple");

    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  });

  it("salts hashes so the same password produces different outputs", async () => {
    const first = await hashOperatorPassword("same password");
    const second = await hashOperatorPassword("same password");

    expect(first).not.toBe(second);
    await expect(verifyPassword(first, "same password")).resolves.toBe(true);
    await expect(verifyPassword(second, "same password")).resolves.toBe(true);
  });

  it("verifies operator credentials against an Argon2id hash", async () => {
    const hash = await hashOperatorPassword("local-password");

    await expect(
      verifyOperatorPassword(
        { ...baseConfig, operatorPasswordHash: hash, operatorPassword: null },
        "operator",
        "local-password",
      ),
    ).resolves.toBe(true);
  });

  it("supports legacy SHA-256 hashes only with a deprecation warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const legacyHash =
      "sha256:03eecb1e5d33a976de28e01c5342da4827ba1f668774bb61fcad9c6fb4dd0ab5";

    expect(isLegacySha256PasswordHash(legacyHash)).toBe(true);
    await expect(verifyPassword(legacyHash, "local-password")).resolves.toBe(
      true,
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("deprecated SHA-256"),
    );

    warn.mockRestore();
  });
});
