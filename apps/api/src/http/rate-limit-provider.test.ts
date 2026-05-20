import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createInMemoryProvider,
  resetRateLimitProvider,
  type RateLimitProvider,
} from "./rate-limit-provider.js";

const noopConfig = {
  nodeEnv: "development" as const,
  apiHost: "127.0.0.1",
  apiPort: 4100,
  webPort: 3100,
  databaseUrl: "postgresql://test:test@localhost:5435/test",
  redisUrl: "redis://localhost:6379",
  baseChainId: 8453,
  baseRpcUrl: "https://mainnet.base.org",
  basescanBaseUrl: "https://basescan.org",
  dryRun: true,
  demoMode: true,
  requireLiveConfirmation: true,
  allowUnlimitedApproval: false,
  autoApprove: false,
  schedulerLiveExecution: false,
  nativeValueSwapsEnabled: false,
  maxNativeValueWei: "0",
  confirmationsRequired: 3,
  submittedTxTimeoutMs: 900000,
  txStuckAfterMinutes: 15,
  txDroppedAfterMinutes: 60,
  txReorgLookbackBlocks: 12,
  quoteProvider: "mock" as const,
  quoteMaxAgeSeconds: 30,
  masterKeyFile: ".local/master.key",
  telegramEnabled: false,
  operatorUsername: "operator",
  operatorPasswordHash: null,
  operatorPassword: null,
  sessionSecret: "test-secret-at-least-32-characters-long",
  vaultUnlockPassphrase: null,
  vaultAutoLockMs: 900000,
  walletLockTtlMs: 300000,
  zeroXSwapQuoteUrl: null,
  zeroXApiKey: "",
  zeroXApiVersion: "v2",
  alertWebhookUrl: null,
  alertWebhookToken: null,
  metricsToken: null,
  vaultProvider: "local-file" as const,
  operatorRole: "admin" as const,
  sessionTtlSeconds: 43200,
  totpIssuer: "BaseOrchestrator",
};

describe("in-memory rate limit provider", () => {
  let provider: RateLimitProvider;

  beforeEach(() => {
    resetRateLimitProvider();
    provider = createInMemoryProvider();
  });

  afterEach(() => {
    resetRateLimitProvider();
  });

  it("allows requests under the limit", async () => {
    await expect(
      provider.assertLimit("test:key", 5, 60_000),
    ).resolves.toBeUndefined();
  });

  it("blocks requests over the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await provider.assertLimit("burst:key", 5, 60_000);
    }
    await expect(
      provider.assertLimit("burst:key", 5, 60_000),
    ).rejects.toThrow("Rate limit exceeded");
  });

  it("resets window after expiration", async () => {
    await provider.assertLimit("window:key", 1, 60_000);
    const fakeNow = Date.now() + 61_000;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(fakeNow);
    await expect(
      provider.assertLimit("window:key", 1, 60_000),
    ).resolves.toBeUndefined();
    nowSpy.mockRestore();
  });

  it("provides consumed and remaining counts", async () => {
    await provider.assertLimit("count:key", 5, 60_000);
    await provider.assertLimit("count:key", 5, 60_000);
    const info = await provider.getLimit("count:key", 5, 60_000);
    expect(info.consumed).toBe(2);
    expect(info.remaining).toBe(3);
  });

  it("marks provider as non-distributed", () => {
    expect(provider.name).toBe("memory");
    expect(provider.isDistributed).toBe(false);
  });

  it("same key has independent buckets per key", async () => {
    await provider.assertLimit("key:a", 1, 60_000);
    await expect(
      provider.assertLimit("key:b", 1, 60_000),
    ).resolves.toBeUndefined();
  });
});

describe("createRateLimitProvider", () => {
  it("uses in-memory when redis not configured", async () => {
    resetRateLimitProvider();
    const { createRateLimitProvider } = await import(
      "./rate-limit-provider.js"
    );
    const config = { ...noopConfig, redisUrl: "" };
    const provider = await createRateLimitProvider(config);
    expect(provider.name).toBe("memory");
  });

  it("uses in-memory for localhost redis in development", async () => {
    resetRateLimitProvider();
    const { createRateLimitProvider } = await import(
      "./rate-limit-provider.js"
    );
    const config = {
      ...noopConfig,
      redisUrl: "redis://localhost:6379",
      nodeEnv: "development" as const,
    };
    const provider = await createRateLimitProvider(config);
    expect(provider.name).toBe("memory");
  });
});