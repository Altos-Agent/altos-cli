import { createHash } from "node:crypto";

export const encryptedWalletBackupFormat =
  "base-orchestrator.encrypted-wallet-backup" as const;

export interface EncryptedWalletBackupEntry {
  name: string;
  address: string;
  encryptedPrivateKey: string;
  encryptionVersion: number;
  status?: "ACTIVE" | "PAUSED" | "DISABLED";
  maxTradeUsd?: string | null;
  maxDailyTrades?: number | null;
  maxDailyLossUsd?: string | null;
  maxGasUsd?: string | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface EncryptedWalletBackup {
  format: typeof encryptedWalletBackupFormat;
  version: 1;
  exportedAt: string;
  masterKeyFingerprint: string;
  wallets: EncryptedWalletBackupEntry[];
}

export const createMasterKeyFingerprint = (masterKey: Buffer) =>
  createHash("sha256")
    .update("base-orchestrator-master-key-fingerprint-v1")
    .update(masterKey)
    .digest("hex");

export const validateEncryptedWalletBackup = (
  value: unknown
): EncryptedWalletBackup => {
  if (!value || typeof value !== "object") {
    throw new Error("Backup file must be a JSON object");
  }

  const backup = value as EncryptedWalletBackup;
  if (
    backup.format !== encryptedWalletBackupFormat ||
    backup.version !== 1 ||
    !Array.isArray(backup.wallets)
  ) {
    throw new Error("Unsupported encrypted wallet backup format");
  }

  for (const wallet of backup.wallets) {
    if (
      "privateKey" in wallet ||
      "seedPhrase" in wallet ||
      "mnemonic" in wallet
    ) {
      throw new Error("Backup must not contain plaintext private keys");
    }
    if (
      typeof wallet.name !== "string" ||
      typeof wallet.address !== "string" ||
      typeof wallet.encryptedPrivateKey !== "string" ||
      typeof wallet.encryptionVersion !== "number"
    ) {
      throw new Error("Backup wallet entries are invalid");
    }
  }

  return backup;
};
