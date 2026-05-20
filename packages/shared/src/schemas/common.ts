import { z } from "zod";
import { safeDecimalStringSchema, tokenDecimalsSchema } from "../amounts.js";

const BASE_CHAIN_ID = 8453;

export const evmAddressSchema = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, { message: "Invalid EVM address" });

export const optionalEvmAddressSchema = z
  .union([evmAddressSchema, z.literal(""), z.null(), z.undefined()])
  .transform((value) => (value ? value : null));

export const baseChainIdSchema = z.literal(BASE_CHAIN_ID);

export const decimalStringSchema = safeDecimalStringSchema;

export const positiveDecimalStringSchema = decimalStringSchema.refine(
  (value) => /[1-9]/.test(value),
  { message: "Amount must be greater than zero" }
);

export const nonNegativeNumericLimitSchema = decimalStringSchema;

export const optionalNonNegativeNumericLimitSchema = z
  .union([nonNegativeNumericLimitSchema, z.number().nonnegative(), z.null(), z.undefined(), z.literal("")])
  .transform((value) =>
    value === undefined || value === null || value === "" ? null : String(value)
  );

export const nonNegativeIntegerSchema = z.number().int().nonnegative();

export const optionalNonNegativeIntegerSchema = z
  .union([nonNegativeIntegerSchema, z.string().regex(/^\d+$/), z.null(), z.undefined(), z.literal("")])
  .transform((value) =>
    value === undefined || value === null || value === "" ? null : Number(value)
  );

export const basisPointsSchema = z.number().int().min(0).max(10_000);

export const optionalBasisPointsSchema = z
  .union([basisPointsSchema, z.string().regex(/^\d+$/), z.null(), z.undefined(), z.literal("")])
  .transform((value) =>
    value === undefined || value === null || value === "" ? null : Number(value)
  )
  .refine((value) => value === null || (value >= 0 && value <= 10_000), {
    message: "Basis points must be between 0 and 10000"
  });

export const tokenDecimalsMetadataSchema = tokenDecimalsSchema;

export const idSchema = z.string().min(1);

export const routeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, {
    message: "Invalid route id"
  });

export const idParamsSchema = z.object({
  id: routeIdSchema
});

export const emptyBodySchema = z
  .union([z.undefined(), z.null(), z.object({}).strict()])
  .transform(() => undefined);

export const privateKeySchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, { message: "Invalid private key format" });

export const booleanSchema = z.boolean();

export const validationErrorMessage = "Invalid request body";
