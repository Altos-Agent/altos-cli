import { z } from "zod";
import {
  baseChainIdSchema,
  idSchema,
  optionalBasisPointsSchema,
  optionalNonNegativeNumericLimitSchema
} from "./common.js";
import {
  optionalVerificationTextSchema,
  optionalVerificationUrlSchema,
  verificationStatusSchema
} from "./token.js";

const pairBaseSchema = z.object({
  chainId: baseChainIdSchema.default(8453),
  tokenInId: idSchema,
  tokenOutId: idSchema,
  enabled: z.boolean().default(false),
  maxTradeUsd: optionalNonNegativeNumericLimitSchema,
  maxSlippageBps: optionalBasisPointsSchema,
  maxPriceImpactBps: optionalBasisPointsSchema,
  preferredRouter: z.string().trim().min(1).nullable().optional(),
  fallbackRouter: z.string().trim().min(1).nullable().optional(),
  verificationStatus: verificationStatusSchema.default("UNVERIFIED"),
  verificationSource: optionalVerificationTextSchema,
  verificationEvidenceUrl: optionalVerificationUrlSchema,
  verifiedBy: optionalVerificationTextSchema,
  verificationNotes: z.string().trim().max(2000).nullable().optional()
});

export const pairCreateSchema = pairBaseSchema
  .refine((value) => value.tokenInId !== value.tokenOutId, {
    message: "Token in and token out must be different",
    path: ["tokenOutId"]
  });

export const pairUpdateSchema = pairBaseSchema.partial().refine(
  (value) =>
    value.tokenInId === undefined ||
    value.tokenOutId === undefined ||
    value.tokenInId !== value.tokenOutId,
  {
    message: "Token in and token out must be different",
    path: ["tokenOutId"]
  }
);

export const walletPairRulesSchema = z.object({
  rules: z.array(
    z.object({
      pairId: idSchema,
      enabled: z.boolean(),
      maxTradeUsd: optionalNonNegativeNumericLimitSchema,
      maxDailyTrades: z
        .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/), z.null(), z.undefined(), z.literal("")])
        .transform((value) =>
          value === undefined || value === null || value === ""
            ? null
            : Number(value)
        )
    })
  )
});
