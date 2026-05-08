import { eq, inArray } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { auditLogs, walletSchedules, wallets } from "../db/schema.js";
import {
  getWalletProfile,
  profileToWalletLimits,
  type WalletProfileId
} from "../profiles/wallet-profiles.js";
import type { SafeWallet, ImportWalletInput, UpdateWalletInput } from "./types.js";
import {
  assertPrivateKeyMatchesAddress,
  deriveAddressFromPrivateKey,
  decryptPrivateKey,
  encryptPrivateKey,
  getEncryptionVersion,
  loadOrCreateMasterKey,
  normalizeAddress,
  WalletVaultError
} from "../vault/wallet-vault.js";
import {
  createMasterKeyFingerprint,
  encryptedWalletBackupFormat,
  validateEncryptedWalletBackup,
  type EncryptedWalletBackup
} from "./encrypted-backup.js";

const localActor = "local";

export class WalletServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "WalletServiceError";
  }
}

const toNumericString = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new WalletServiceError("Limit values must be non-negative numbers");
  }

  return String(value);
};

const toTradeCount = (value: string | number | null | undefined) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new WalletServiceError("maxDailyTrades must be a non-negative integer");
  }

  return numericValue;
};

const sanitizeWallet = (wallet: typeof wallets.$inferSelect): SafeWallet => ({
  id: wallet.id,
  name: wallet.name,
  address: wallet.address,
  status: wallet.status,
  maxTradeUsd: wallet.maxTradeUsd,
  maxDailyTrades: wallet.maxDailyTrades,
  maxDailyLossUsd: wallet.maxDailyLossUsd,
  maxGasUsd: wallet.maxGasUsd,
  notes: wallet.notes,
  createdAt: wallet.createdAt,
  updatedAt: wallet.updatedAt
});

const insertAuditLog = async (
  db: DbClient,
  action: string,
  entityId: string,
  metadataJson?: Record<string, unknown>
) => {
  await db.insert(auditLogs).values({
    actor: localActor,
    action,
    entityType: "wallet",
    entityId,
    metadataJson
  });
};

const sanitizeEncryptedBackupWallet = (
  wallet: typeof wallets.$inferSelect
) => ({
  name: wallet.name,
  address: wallet.address,
  encryptedPrivateKey: wallet.encryptedPrivateKey,
  encryptionVersion: wallet.encryptionVersion,
  status: wallet.status,
  maxTradeUsd: wallet.maxTradeUsd,
  maxDailyTrades: wallet.maxDailyTrades,
  maxDailyLossUsd: wallet.maxDailyLossUsd,
  maxGasUsd: wallet.maxGasUsd,
  notes: wallet.notes
});

export const createWalletService = (db: DbClient) => ({
  async listWallets() {
    const rows = await db.select().from(wallets);
    return rows.map(sanitizeWallet);
  },

  async getWallet(id: string) {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
    if (!wallet) {
      throw new WalletServiceError("Wallet not found", 404);
    }

    return sanitizeWallet(wallet);
  },

  async importWallet(input: ImportWalletInput) {
    if (
      !input ||
      typeof input.name !== "string" ||
      typeof input.privateKey !== "string"
    ) {
      throw new WalletServiceError("Wallet name and private key are required");
    }

    const name = input.name.trim();
    if (!name) {
      throw new WalletServiceError("Wallet name is required");
    }

    const address = input.address
      ? assertPrivateKeyMatchesAddress(input.privateKey, input.address)
      : deriveAddressFromPrivateKey(input.privateKey);
    const normalizedAddress = normalizeAddress(address);

    const existing = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(eq(wallets.address, normalizedAddress));

    if (existing.length > 0) {
      throw new WalletServiceError("Wallet address already exists", 409);
    }

    const masterKey = await loadOrCreateMasterKey();
    const encryptedPrivateKey = encryptPrivateKey(input.privateKey, masterKey);

    const inserted = await db
      .insert(wallets)
      .values({
        name,
        address: normalizedAddress,
        encryptedPrivateKey,
        encryptionVersion: getEncryptionVersion(),
        status: "PAUSED",
        maxTradeUsd: toNumericString(input.maxTradeUsd),
        maxDailyTrades: toTradeCount(input.maxDailyTrades),
        maxDailyLossUsd: toNumericString(input.maxDailyLossUsd),
        maxGasUsd: toNumericString(input.maxGasUsd),
        notes: input.notes ?? null
      })
      .returning()
      .catch((error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new WalletServiceError("Wallet address already exists", 409);
        }

        throw error;
      });

    const [wallet] = inserted;

    if (!wallet) {
      throw new WalletServiceError("Wallet import failed", 500);
    }

    await insertAuditLog(db, "wallet.create", wallet.id, {
      address: wallet.address,
      status: wallet.status
    });

    return sanitizeWallet(wallet);
  },

  async updateWallet(id: string, input: UpdateWalletInput) {
    if (!input || typeof input !== "object") {
      throw new WalletServiceError("Wallet update body is required");
    }

    const updates: Partial<typeof wallets.$inferInsert> = {
      updatedAt: new Date()
    };

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new WalletServiceError("Wallet name cannot be empty");
      }
      updates.name = name;
    }

    if (input.status !== undefined) {
      updates.status = input.status;
    }

    if ("maxTradeUsd" in input) {
      updates.maxTradeUsd = toNumericString(input.maxTradeUsd);
    }
    if ("maxDailyTrades" in input) {
      updates.maxDailyTrades = toTradeCount(input.maxDailyTrades);
    }
    if ("maxDailyLossUsd" in input) {
      updates.maxDailyLossUsd = toNumericString(input.maxDailyLossUsd);
    }
    if ("maxGasUsd" in input) {
      updates.maxGasUsd = toNumericString(input.maxGasUsd);
    }
    if ("notes" in input) {
      updates.notes = input.notes ?? null;
    }

    const [wallet] = await db
      .update(wallets)
      .set(updates)
      .where(eq(wallets.id, id))
      .returning();

    if (!wallet) {
      throw new WalletServiceError("Wallet not found", 404);
    }

    return sanitizeWallet(wallet);
  },

  async setWalletStatus(
    id: string,
    status: "ACTIVE" | "PAUSED" | "DISABLED",
    action: "wallet.pause" | "wallet.resume" | "wallet.disable"
  ) {
    const wallet = await this.updateWallet(id, { status });
    await insertAuditLog(db, action, id, { status });
    return wallet;
  },

  async setBulkWalletStatus(
    ids: string[],
    status: "ACTIVE" | "PAUSED" | "DISABLED"
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new WalletServiceError("At least one wallet id is required");
    }

    const updated = await db
      .update(wallets)
      .set({ status, updatedAt: new Date() })
      .where(inArray(wallets.id, ids))
      .returning();

    for (const wallet of updated) {
      const action =
        status === "ACTIVE"
          ? "wallet.bulk.resume"
          : status === "PAUSED"
            ? "wallet.bulk.pause"
            : "wallet.bulk.disable";
      await insertAuditLog(db, action, wallet.id, {
        status
      });
    }

    return {
      updated: updated.map(sanitizeWallet),
      count: updated.length
    };
  },

  async applyProfileToWallets(input: {
    walletIds: string[];
    profileId: WalletProfileId;
  }) {
    if (!Array.isArray(input.walletIds) || input.walletIds.length === 0) {
      throw new WalletServiceError("At least one wallet id is required");
    }

    const profile = getWalletProfile(input.profileId);
    const walletLimits = profileToWalletLimits(profile);
    const updated = await db
      .update(wallets)
      .set({ ...walletLimits, updatedAt: new Date() })
      .where(inArray(wallets.id, input.walletIds))
      .returning();

    for (const wallet of updated) {
      const [existingSchedule] = await db
        .select()
        .from(walletSchedules)
        .where(eq(walletSchedules.walletId, wallet.id));
      const scheduleValues = {
        enabled: profile.scheduleDefaults.enabled,
        tradeAmountUsd: profile.scheduleDefaults.tradeAmountUsd,
        minIntervalMinutes: profile.scheduleDefaults.minIntervalMinutes,
        maxDailyTrades: profile.scheduleDefaults.maxDailyTrades,
        strategyProfile: profile.scheduleDefaults.strategyProfile,
        failedTxPauseThreshold: profile.scheduleDefaults.failedTxPauseThreshold,
        emergencyPaused: profile.scheduleDefaults.emergencyPaused,
        updatedAt: new Date()
      };

      if (existingSchedule) {
        await db
          .update(walletSchedules)
          .set(scheduleValues)
          .where(eq(walletSchedules.id, existingSchedule.id));
      } else {
        await db.insert(walletSchedules).values({
          walletId: wallet.id,
          ...scheduleValues
        });
      }

      await insertAuditLog(db, "wallet.bulk.apply_profile", wallet.id, {
        profileId: profile.id,
        allowedRiskLevel: profile.allowedRiskLevel,
        defaultPairs: profile.defaultPairs
      });
    }

    return {
      profile,
      updated: updated.map(sanitizeWallet),
      count: updated.length
    };
  },

  async exportEncryptedWalletBackup(input?: { walletIds?: string[] }) {
    const masterKey = await loadOrCreateMasterKey();
    const selectedWallets =
      input?.walletIds && input.walletIds.length > 0
        ? await db
            .select()
            .from(wallets)
            .where(inArray(wallets.id, input.walletIds))
        : await db.select().from(wallets);

    const backup: EncryptedWalletBackup = {
      format: encryptedWalletBackupFormat,
      version: 1,
      exportedAt: new Date().toISOString(),
      masterKeyFingerprint: createMasterKeyFingerprint(masterKey),
      wallets: selectedWallets.map(sanitizeEncryptedBackupWallet)
    };

    await db.insert(auditLogs).values({
      actor: localActor,
      action: "wallet.bulk.export_encrypted",
      entityType: "wallet",
      entityId: null,
      metadataJson: {
        count: selectedWallets.length
      }
    });

    return backup;
  },

  async importEncryptedWalletBackup(input: {
    backup: unknown;
    rotateKeys?: boolean;
    allowDisabledMismatchImport?: boolean;
  }) {
    const backup = validateEncryptedWalletBackup(input.backup);
    const masterKey = await loadOrCreateMasterKey();
    const currentFingerprint = createMasterKeyFingerprint(masterKey);
    const fingerprintMatches =
      backup.masterKeyFingerprint === currentFingerprint;

    if (!fingerprintMatches && !input.allowDisabledMismatchImport) {
      throw new WalletServiceError(
        "Encrypted backup master key does not match this app instance",
        409
      );
    }

    const imported: SafeWallet[] = [];
    const skipped: string[] = [];

    for (const entry of backup.wallets) {
      const normalizedAddress = normalizeAddress(entry.address);
      const existing = await db
        .select({ id: wallets.id })
        .from(wallets)
        .where(eq(wallets.address, normalizedAddress));

      if (existing.length > 0) {
        skipped.push(normalizedAddress);
        continue;
      }

      let encryptedPrivateKey = entry.encryptedPrivateKey;
      let encryptionVersion = entry.encryptionVersion;
      let status: "ACTIVE" | "PAUSED" | "DISABLED" = fingerprintMatches
        ? "PAUSED"
        : "DISABLED";
      let notes = entry.notes ?? null;

      if (input.rotateKeys && fingerprintMatches) {
        const privateKey = decryptPrivateKey(entry.encryptedPrivateKey, masterKey);
        assertPrivateKeyMatchesAddress(privateKey, normalizedAddress);
        encryptedPrivateKey = encryptPrivateKey(privateKey, masterKey);
        encryptionVersion = getEncryptionVersion();
      }

      if (!fingerprintMatches) {
        notes = `${notes ? `${notes}\n` : ""}Imported from encrypted backup with non-matching master key; disabled until re-imported or remediated.`;
      }

      const [wallet] = await db
        .insert(wallets)
        .values({
          name: entry.name,
          address: normalizedAddress,
          encryptedPrivateKey,
          encryptionVersion,
          status,
          maxTradeUsd: entry.maxTradeUsd ?? null,
          maxDailyTrades: entry.maxDailyTrades ?? null,
          maxDailyLossUsd: entry.maxDailyLossUsd ?? null,
          maxGasUsd: entry.maxGasUsd ?? null,
          notes
        })
        .returning();

      if (wallet) {
        imported.push(sanitizeWallet(wallet));
        await insertAuditLog(db, "wallet.bulk.import_encrypted", wallet.id, {
          fingerprintMatches,
          rotateKeys: input.rotateKeys === true,
          status
        });
      }
    }

    return {
      imported,
      skipped,
      count: imported.length,
      masterKeyMatched: fingerprintMatches
    };
  },

  async rotateWalletKey(id: string) {
    const [existingWallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, id));

    if (!existingWallet) {
      throw new WalletServiceError("Wallet not found", 404);
    }

    const masterKey = await loadOrCreateMasterKey();
    const privateKey = decryptPrivateKey(
      existingWallet.encryptedPrivateKey,
      masterKey
    );
    const encryptedPrivateKey = encryptPrivateKey(privateKey, masterKey);

    const [wallet] = await db
      .update(wallets)
      .set({
        encryptedPrivateKey,
        encryptionVersion: getEncryptionVersion(),
        updatedAt: new Date()
      })
      .where(eq(wallets.id, id))
      .returning();

    if (!wallet) {
      throw new WalletServiceError("Wallet not found", 404);
    }

    await insertAuditLog(db, "wallet.key_rotation", id, {
      encryptionVersion: wallet.encryptionVersion
    });

    return sanitizeWallet(wallet);
  },

  async deleteWallet(id: string) {
    const [wallet] = await db
      .delete(wallets)
      .where(eq(wallets.id, id))
      .returning();

    if (!wallet) {
      throw new WalletServiceError("Wallet not found", 404);
    }

    await insertAuditLog(db, "wallet.delete", id, {
      address: wallet.address
    });

    return sanitizeWallet(wallet);
  }
});

export const isWalletError = (
  error: unknown
): error is WalletServiceError | WalletVaultError =>
  error instanceof WalletServiceError || error instanceof WalletVaultError;
