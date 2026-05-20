import { z } from "zod";
import { idSchema, positiveDecimalStringSchema } from "./common.js";

export const dryRunPlanSchema = z.object({
  walletId: idSchema,
  pairId: idSchema,
  sellAmountDisplay: positiveDecimalStringSchema,
  preferredRouter: z.string().trim().min(1).nullable().optional(),
  mode: z.literal("DRY_RUN_ONLY")
});

export const quoteRequestSchema = dryRunPlanSchema.omit({ mode: true });

export const executeOnceSchema = quoteRequestSchema.extend({
  confirmLiveExecution: z.boolean().optional(),
  autoApprove: z.boolean().optional()
});
