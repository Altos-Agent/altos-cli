import { z } from "zod";
import { idSchema, positiveDecimalStringSchema } from "./common.js";

export const approvalRequestSchema = z.object({
  tokenId: idSchema,
  routerId: idSchema,
  amount: positiveDecimalStringSchema.optional(),
  confirmLiveExecution: z.boolean().optional()
});
