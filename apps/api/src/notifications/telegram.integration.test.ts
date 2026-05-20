import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { decryptSecret, loadOrCreateMasterKey } from "../vault/wallet-vault.js";
import { createTelegramService } from "./telegram.js";

const originalMasterKeyFile = process.env.MASTER_KEY_FILE;

describe("telegram settings integration", () => {
  afterEach(() => {
    process.env.MASTER_KEY_FILE = originalMasterKeyFile;
    vi.restoreAllMocks();
  });

  it("saves settings with an encrypted bot token and returns only a token preview", async () => {
    const dir = await mkdtemp(join(tmpdir(), "base-telegram-settings-"));
    process.env.MASTER_KEY_FILE = join(dir, "master.key");
    const { db, tables } = createInMemoryDb();
    const service = createTelegramService(db as never);
    const botToken = "123456:ABCDEFghijklmnopqrstuvwxyz";

    const saved = await service.updateSettings({
      enabled: true,
      botToken,
      chatId: "987654",
      notifyOnDryRun: true,
    });

    expect(saved).toMatchObject({
      enabled: true,
      tokenPreview: "123456:ABC...xyz",
      chatId: "987654",
      notifyOnDryRun: true,
    });
    expect(saved).not.toHaveProperty("botToken");

    const [settings] = tables.telegramSettings;
    expect(settings?.encryptedBotToken).toEqual(expect.any(String));
    expect(settings?.encryptedBotToken).not.toContain(botToken);

    const masterKey = await loadOrCreateMasterKey();
    expect(
      decryptSecret(settings?.encryptedBotToken as string, masterKey),
    ).toBe(botToken);
  });

  it("creates delivery audit rows for mocked Telegram success and failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "base-telegram-delivery-"));
    process.env.MASTER_KEY_FILE = join(dir, "master.key");
    const { db, tables } = createInMemoryDb();
    const service = createTelegramService(db as never);
    await service.updateSettings({
      enabled: true,
      botToken: "123456:ABCDEFghijklmnopqrstuvwxyz",
      chatId: "987654",
      notifyOnDryRun: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );
    await service.notify({
      eventType: "dry-run accepted",
      walletName: "Primary",
      walletAddress: "0x0000000000000000000000000000000000000001",
      walletId: "00000000-0000-4000-8000-000000000001",
      action: "SWAP",
      pair: "USDC/WETH",
      amount: "5",
      status: "DRY_RUN",
      txHash: null,
      basescanUrl: null,
      transactionId: "00000000-0000-4000-8000-000000000101",
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      requestId: "req-success",
      jobId: "job-success",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":false}', { status: 500 })),
    );
    await service
      .notify({
        eventType: "dry-run accepted",
        walletName: "Primary",
        walletAddress: "0x0000000000000000000000000000000000000001",
        walletId: "00000000-0000-4000-8000-000000000001",
        action: "SWAP",
        pair: "USDC/WETH",
        amount: "5",
        status: "DRY_RUN",
        txHash: null,
        basescanUrl: null,
        transactionId: "00000000-0000-4000-8000-000000000102",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        requestId: "req-failure",
        jobId: "job-failure",
      })
      .catch(() => undefined);

    expect(tables.notificationDeliveries).toEqual([
      expect.objectContaining({
        channel: "telegram",
        eventType: "dry-run accepted",
        status: "SENT",
        requestId: "req-success",
        jobId: "job-success",
        destinationPreview: "chat:987654",
      }),
      expect.objectContaining({
        channel: "telegram",
        eventType: "dry-run accepted",
        status: "FAILED",
        requestId: "req-failure",
        jobId: "job-failure",
        errorCode: "TELEGRAM_SEND_FAILED",
      }),
    ]);
    expect(JSON.stringify(tables.notificationDeliveries)).not.toContain(
      "ABCDEFghijklmnopqrstuvwxyz",
    );
  });

  it("records disabled and missing destination skips without sending", async () => {
    const { db, tables } = createInMemoryDb();
    const service = createTelegramService(db as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await service.notify({
      eventType: "dry-run rejected",
      walletName: "Primary",
      walletAddress: "0x0000000000000000000000000000000000000001",
      action: "SWAP",
      pair: "USDC/WETH",
      amount: "5",
      status: "REJECTED",
      txHash: null,
      basescanUrl: null,
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      requestId: "req-skip",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(tables.notificationDeliveries).toContainEqual(
      expect.objectContaining({
        channel: "telegram",
        eventType: "dry-run rejected",
        status: "SKIPPED",
        requestId: "req-skip",
        errorCode: "TELEGRAM_DISABLED",
      }),
    );
  });
});
