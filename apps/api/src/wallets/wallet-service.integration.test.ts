import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet } from "ethers";
import { afterEach, describe, expect, it } from "vitest";
import {
  decryptPrivateKey,
  loadOrCreateMasterKey,
} from "../vault/wallet-vault.js";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { createWalletService } from "./wallet-service.js";

const originalMasterKeyFile = process.env.MASTER_KEY_FILE;

describe("wallet import integration", () => {
  afterEach(() => {
    process.env.MASTER_KEY_FILE = originalMasterKeyFile;
  });

  it("imports a wallet through the service with encrypted key storage and safe output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "base-wallet-import-"));
    process.env.MASTER_KEY_FILE = join(dir, "master.key");
    const { db, tables } = createInMemoryDb();
    const service = createWalletService(db as never);
    const importedWallet = Wallet.createRandom();

    const result = await service.importWallet({
      name: "Integration Wallet",
      privateKey: importedWallet.privateKey,
      maxTradeUsd: "10",
    });

    expect(result).toMatchObject({
      name: "Integration Wallet",
      address: importedWallet.address,
      status: "PAUSED",
      maxTradeUsd: "10",
    });
    expect(result).not.toHaveProperty("privateKey");
    expect(result).not.toHaveProperty("encryptedPrivateKey");

    const [storedWallet] = tables.wallets;
    expect(storedWallet?.encryptedPrivateKey).toEqual(expect.any(String));
    expect(storedWallet?.encryptedPrivateKey).not.toContain(
      importedWallet.privateKey,
    );

    const masterKey = await loadOrCreateMasterKey();
    expect(
      decryptPrivateKey(storedWallet?.encryptedPrivateKey as string, masterKey),
    ).toBe(importedWallet.privateKey);
    expect(tables.auditLogs).toHaveLength(1);
    expect(tables.auditLogs[0]?.action).toBe("wallet.create");
  });
});
