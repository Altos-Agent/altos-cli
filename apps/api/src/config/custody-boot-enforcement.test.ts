import { describe, expect, it } from "vitest";
import { parseRuntimeEnv, RuntimeEnvError } from "./env.js";

const baseEnv = {
  NODE_ENV: "development",
  API_HOST: "127.0.0.1",
  API_PORT: "4100",
  DATABASE_URL: "postgresql://test:test@localhost:5435/test",
  REDIS_URL: "redis://localhost:6379",
  BASE_CHAIN_ID: "8453",
  BASE_RPC_URL: "https://mainnet.base.org",
  BASESCAN_BASE_URL: "https://basescan.org",
  DRY_RUN: "true",
  DEMO_MODE: "true",
  REQUIRE_LIVE_CONFIRMATION: "false",
  ALLOW_UNLIMITED_APPROVAL: "false",
  AUTO_APPROVE: "false",
  SCHEDULER_LIVE_EXECUTION: "false",
  NATIVE_VALUE_SWAPS_ENABLED: "false",
  MAX_NATIVE_VALUE_WEI: "0",
  CONFIRMATIONS_REQUIRED: "3",
  SUBMITTED_TX_TIMEOUT_MS: "900000",
  TX_STUCK_AFTER_MINUTES: "15",
  TX_DROPPED_AFTER_MINUTES: "60",
  TX_REORG_LOOKBACK_BLOCKS: "12",
  QUOTE_PROVIDER: "mock",
  QUOTE_MAX_AGE_SECONDS: "30",
  VAULT_PROVIDER: "local-file",
  MASTER_KEY_FILE: ".local/master.key",
  TELEGRAM_ENABLED: "false",
  OPERATOR_USERNAME: "operator",
  OPERATOR_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$RXJhbXBsZVBhc3N3b3JkSGV4AAAAAAAAAAAAAAAAAAAAAAAAAAA$vU2X9K1P7gDJqF9b7sK0nR4l5M6N8pO9qR2sT3uV4wX5yZ6aB7cC8dD9eE",
  SESSION_SECRET: "test-secret-that-is-at-least-32-characters-long",
  VAULT_AUTO_LOCK_MS: "900000",
  WALLET_LOCK_TTL_MS: "300000",
  ZEROX_API_VERSION: "v2",
};

describe("Custody provider boot enforcement", () => {
  describe("SCHEDULER_LIVE_EXECUTION + local-file", () => {
    it("rejects SCHEDULER_LIVE_EXECUTION + local-file in production", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "production",
        DRY_RUN: "false",
        SCHEDULER_LIVE_EXECUTION: "true",
        VAULT_PROVIDER: "local-file",
      };
      expect(() => parseRuntimeEnv(env)).toThrow(/SCHEDULER_LIVE_EXECUTION.*local-file/i);
    });

    it("rejects SCHEDULER_LIVE_EXECUTION + local-file in development", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "development",
        DRY_RUN: "false",
        SCHEDULER_LIVE_EXECUTION: "true",
        VAULT_PROVIDER: "local-file",
      };
      expect(() => parseRuntimeEnv(env)).toThrow(/SCHEDULER_LIVE_EXECUTION.*local-file/i);
    });

    it("allows SCHEDULER_LIVE_EXECUTION=false with local-file", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "development",
        SCHEDULER_LIVE_EXECUTION: "false",
        VAULT_PROVIDER: "local-file",
      };
      const config = parseRuntimeEnv(env);
      expect(config.vaultProvider).toBe("local-file");
      expect(config.schedulerLiveExecution).toBe(false);
    });
  });

  describe("VAULT_PROVIDER=external-http-signer validation", () => {
    it("rejects external-http-signer without EXTERNAL_SIGNER_URL", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "production",
        DRY_RUN: "false",
        SCHEDULER_LIVE_EXECUTION: "false",
        VAULT_PROVIDER: "external-http-signer",
        EXTERNAL_SIGNER_TOKEN: "token",
        // missing EXTERNAL_SIGNER_URL
      };
      expect(() => parseRuntimeEnv(env)).toThrow(/EXTERNAL_SIGNER_URL/i);
    });

    it("rejects external-http-signer with empty EXTERNAL_SIGNER_URL", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "production",
        DRY_RUN: "false",
        VAULT_PROVIDER: "external-http-signer",
        EXTERNAL_SIGNER_URL: "",
        EXTERNAL_SIGNER_TOKEN: "token",
      };
      expect(() => parseRuntimeEnv(env)).toThrow(/EXTERNAL_SIGNER_URL/i);
    });

    it("allows external-http-signer with EXTERNAL_SIGNER_URL configured", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "production",
        DRY_RUN: "false",
        DEMO_MODE: "false",
        SCHEDULER_LIVE_EXECUTION: "false",
        VAULT_PROVIDER: "external-http-signer",
        EXTERNAL_SIGNER_URL: "https://signer.example.com",
        EXTERNAL_SIGNER_TOKEN: "token",
        METRICS_TOKEN: "metrics-token-for-production",
        OPERATOR_PASSWORD_HASH:
          "$argon2id$v=19$m=65536,t=3,p=4$RXJhbXBsZVBhc3N3b3JkSGV4AAAAAAAAAAAAAAAAAAAAAAAAAAA$vU2X9K1P7gDJqF9b7sK0nR4l5M6N8pO9qR2sT3uV4wX5yZ6aB7cC8dD9eE",
      };
      const config = parseRuntimeEnv(env);
      expect(config.vaultProvider).toBe("external-http-signer");
    });
  });

  describe("local-file with DRY_RUN", () => {
    it("allows local-file in development with DRY_RUN=true", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "development",
        DRY_RUN: "true",
        VAULT_PROVIDER: "local-file",
      };
      const config = parseRuntimeEnv(env);
      expect(config.vaultProvider).toBe("local-file");
      expect(config.dryRun).toBe(true);
    });

    it("allows local-file in development with DEMO_MODE=true", () => {
      const env = {
        ...baseEnv,
        NODE_ENV: "development",
        DEMO_MODE: "true",
        DRY_RUN: "true",
        VAULT_PROVIDER: "local-file",
      };
      const config = parseRuntimeEnv(env);
      expect(config.vaultProvider).toBe("local-file");
    });
  });
});