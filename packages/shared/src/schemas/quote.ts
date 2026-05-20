import { z } from "zod";
import {
  basisPointsSchema,
  baseChainIdSchema,
  decimalStringSchema,
  optionalEvmAddressSchema
} from "./common.js";

const dateLikeSchema = z.union([
  z.date(),
  z.string().datetime().transform((value) => new Date(value))
]);

const hexDataSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, { message: "Value must be hex data" });

export const rawAmountStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, { message: "Raw amount must be an integer string" });

export const positiveRawAmountStringSchema = rawAmountStringSchema.refine(
  (value) => BigInt(value) > 0n,
  { message: "Raw amount must be greater than zero" }
);

export const normalizedQuoteSchema = z.object({
  chainId: baseChainIdSchema,
  provider: z.enum(["mock", "zeroX"]),
  routerName: z.string().min(1),
  routerAddress: optionalEvmAddressSchema,
  spenderAddress: optionalEvmAddressSchema,
  allowanceTarget: optionalEvmAddressSchema,
  sellToken: z.string().min(1),
  buyToken: z.string().min(1),
  sellTokenAddress: optionalEvmAddressSchema,
  buyTokenAddress: optionalEvmAddressSchema,
  sellAmountDisplay: decimalStringSchema,
  sellAmountRaw: positiveRawAmountStringSchema,
  buyAmountDisplay: decimalStringSchema,
  buyAmountRaw: positiveRawAmountStringSchema,
  sellAmountUsd: decimalStringSchema.nullable(),
  buyAmountUsd: decimalStringSchema.nullable(),
  minBuyAmountRaw: rawAmountStringSchema.nullable(),
  estimatedGas: z.object({
    gasUsed: rawAmountStringSchema,
    gasUsd: decimalStringSchema,
    feeNative: decimalStringSchema
  }),
  priceImpactBps: basisPointsSchema.nullable(),
  slippageBps: basisPointsSchema,
  txTo: optionalEvmAddressSchema,
  txData: z.union([hexDataSchema, z.null()]),
  txValue: rawAmountStringSchema,
  usdPriceSource: z.string().min(1).nullable(),
  usdPriceTimestamp: dateLikeSchema.nullable(),
  quoteUsdSource: z.string().min(1).nullable(),
  quotedAt: dateLikeSchema,
  quoteTimestamp: dateLikeSchema,
  expiresAt: dateLikeSchema,
  warnings: z.array(z.string()),
  rawResponse: z.unknown().nullable()
});

export type NormalizedQuoteSchema = z.infer<typeof normalizedQuoteSchema>;
