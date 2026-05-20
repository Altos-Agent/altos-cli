import { z } from "zod";
import {
  optionalNonNegativeIntegerSchema,
  positiveDecimalStringSchema
} from "./common.js";

export const walletScheduleSchema = z.object({
  enabled: z.boolean(),
  tradeAmountUsd: positiveDecimalStringSchema,
  minIntervalMinutes: z.number().int().positive(),
  maxDailyRuns: optionalNonNegativeIntegerSchema,
  maxDailyTrades: optionalNonNegativeIntegerSchema.optional(),
  strategyProfile: z.enum([
    "MANUAL_ONLY",
    "STABLE_ONLY",
    "LOW_FEE_ONLY",
    "TOKEN_ROTATION_LIMITED"
  ]),
  failedTxPauseThreshold: z.number().int().nonnegative(),
  emergencyPaused: z.boolean()
});
