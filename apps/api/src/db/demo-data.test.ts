import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import {
  demoEncryptedPrivateKeyPlaceholder,
  demoWalletIds,
  seedDemoData,
} from "./demo-data.js";

describe("demo data seed", () => {
  it("creates UI-only demo wallets, balances, transaction history, enabled pairs, and disabled Telegram", async () => {
    const { db, tables } = createInMemoryDb();

    await seedDemoData(db as never);

    expect(tables.wallets).toHaveLength(2);
    expect(tables.wallets.map((wallet) => wallet.id)).toEqual(demoWalletIds);
    expect(
      tables.wallets.every(
        (wallet) =>
          wallet.encryptedPrivateKey === demoEncryptedPrivateKeyPlaceholder,
      ),
    ).toBe(true);

    expect(tables.tokens.filter((token) => token.enabled)).toHaveLength(3);
    expect(tables.routers).toContainEqual(
      expect.objectContaining({ name: "Demo Router", enabled: true }),
    );
    expect(tables.pairs.filter((pair) => pair.enabled)).toHaveLength(2);
    expect(tables.walletPairRules).toHaveLength(4);

    expect(tables.transactions).toHaveLength(4);
    expect(
      tables.transactions.every(
        (transaction) =>
          typeof transaction.txHash === "string" &&
          /^0x[0-9a-f]{64}$/.test(transaction.txHash) &&
          String(transaction.basescanUrl).includes("demo=true"),
      ),
    ).toBe(true);

    expect(tables.telegramSettings).toContainEqual(
      expect.objectContaining({
        enabled: false,
        encryptedBotToken: null,
        chatId: null,
      }),
    );
  });
});
