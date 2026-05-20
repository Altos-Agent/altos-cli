import { z } from "zod";
import {
  idSchema,
  emptyBodySchema,
  evmAddressSchema,
  optionalNonNegativeIntegerSchema,
  optionalNonNegativeNumericLimitSchema,
  privateKeySchema
} from "./common.js";

export const walletStatusSchema = z.enum(["ACTIVE", "PAUSED", "DISABLED"]);

export const importWalletSchema = z.object({
  name: z.string().trim().min(1),
  privateKey: privateKeySchema,
  maxTradeUsd: optionalNonNegativeNumericLimitSchema,
  maxDailyTrades: optionalNonNegativeIntegerSchema,
  maxDailyLossUsd: optionalNonNegativeNumericLimitSchema,
  maxGasUsd: optionalNonNegativeNumericLimitSchema,
  notes: z.string().nullable().optional()
});

export const updateWalletSchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: walletStatusSchema.optional(),
  maxTradeUsd: optionalNonNegativeNumericLimitSchema.optional(),
  maxDailyTrades: optionalNonNegativeIntegerSchema.optional(),
  maxDailyLossUsd: optionalNonNegativeNumericLimitSchema.optional(),
  maxGasUsd: optionalNonNegativeNumericLimitSchema.optional(),
  notes: z.string().nullable().optional()
});

export const walletIdsSchema = z.object({
  walletIds: z.array(idSchema).default([])
});

const encryptedWalletBackupEntrySchema = z
  .object({
    name: z.string().trim().min(1),
    address: evmAddressSchema,
    encryptedPrivateKey: z.string().min(1),
    encryptionVersion: z.number().int().positive(),
    status: walletStatusSchema.optional(),
    maxTradeUsd: optionalNonNegativeNumericLimitSchema.optional(),
    maxDailyTrades: optionalNonNegativeIntegerSchema.optional(),
    maxDailyLossUsd: optionalNonNegativeNumericLimitSchema.optional(),
    maxGasUsd: optionalNonNegativeNumericLimitSchema.optional(),
    notes: z.string().nullable().optional()
  })
  .catchall(z.unknown())
  .superRefine((value, context) => {
    const unsafe = value as Record<string, unknown>;
    for (const key of ["privateKey", "seedPhrase", "mnemonic"]) {
      if (key in unsafe) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Backup must not contain plaintext private keys"
        });
      }
    }
  });

export const encryptedWalletBackupSchema = z.object({
  format: z.literal("base-orchestrator.encrypted-wallet-backup"),
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  masterKeyFingerprint: z.string().min(1),
  wallets: z.array(encryptedWalletBackupEntrySchema)
});

export const importEncryptedWalletBackupSchema = z.object({
  backup: encryptedWalletBackupSchema,
  rotateKeys: z.boolean().optional(),
  allowDisabledMismatchImport: z.boolean().optional()
});

export const emptyWalletMutationBodySchema = emptyBodySchema;

export const bulkWalletStatusSchema = z.object({
  walletIds: z.array(idSchema).min(1),
  status: walletStatusSchema
});

export const bulkApplyProfileSchema = z.object({
  walletIds: z.array(idSchema).min(1),
  profileId: z.enum([
    "conservative",
    "stable-only",
    "low-fee",
    "token-rotation-limited",
    "manual-only"
  ])
});
