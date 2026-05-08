import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { decryptSecret, loadOrCreateMasterKey } from "../vault/wallet-vault.js";
import { createTelegramService } from "./telegram.js";

const originalMasterKeyFile = process.env.MASTER_KEY_FILE;

describe("telegram settings integration", () => {
  afterEach(() => {
    process.env.MASTER_KEY_FILE = originalMasterKeyFile;
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
});
