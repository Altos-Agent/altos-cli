import { describe, expect, it } from "vitest";
import {
  createMasterKeyFingerprint,
  validateEncryptedWalletBackup
} from "./encrypted-backup.js";

describe("encrypted wallet backup", () => {
  it("creates a stable non-raw fingerprint for the master key", () => {
    const masterKey = Buffer.alloc(32, 7);
    const fingerprint = createMasterKeyFingerprint(masterKey);

    expect(fingerprint).toHaveLength(64);
    expect(fingerprint).not.toContain(masterKey.toString("hex"));
    expect(createMasterKeyFingerprint(masterKey)).toBe(fingerprint);
  });

  it("rejects plaintext private key fields in backup wallet entries", () => {
    expect(() =>
      validateEncryptedWalletBackup({
        format: "base-orchestrator.encrypted-wallet-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        masterKeyFingerprint: "abc",
        wallets: [
          {
            name: "unsafe",
            address: "0x0000000000000000000000000000000000000001",
            encryptedPrivateKey: "encrypted",
            encryptionVersion: 1,
            privateKey: "0xabc"
          }
        ]
      })
    ).toThrow("Backup must not contain plaintext private keys");
  });
});
