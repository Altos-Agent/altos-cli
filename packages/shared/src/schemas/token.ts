import { z } from "zod";
import {
  baseChainIdSchema,
  optionalEvmAddressSchema,
  optionalNonNegativeNumericLimitSchema,
  tokenDecimalsMetadataSchema
} from "./common.js";

export const riskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const verificationStatusSchema = z.enum([
  "UNVERIFIED",
  "VERIFIED",
  "PLACEHOLDER",
  "BLOCKED"
]);

export const optionalVerificationTextSchema = z
  .string()
  .trim()
  .max(512)
  .nullable()
  .optional();

export const optionalVerificationUrlSchema = z
  .string()
  .trim()
  .url()
  .max(1024)
  .nullable()
  .optional();

export const tokenCreateSchema = z.object({
  chainId: baseChainIdSchema.default(8453),
  symbol: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(128),
  address: optionalEvmAddressSchema,
  decimals: tokenDecimalsMetadataSchema,
  riskLevel: riskLevelSchema.default("MEDIUM"),
  enabled: z.boolean().default(false),
  maxTradeUsd: optionalNonNegativeNumericLimitSchema,
  verificationStatus: verificationStatusSchema.default("UNVERIFIED"),
  verificationSource: optionalVerificationTextSchema,
  verificationEvidenceUrl: optionalVerificationUrlSchema,
  verifiedBy: optionalVerificationTextSchema,
  verificationNotes: z.string().trim().max(2000).nullable().optional()
});

export const tokenUpdateSchema = tokenCreateSchema.partial();
