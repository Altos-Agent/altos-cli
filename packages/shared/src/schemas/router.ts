import { z } from "zod";
import {
  baseChainIdSchema,
  optionalEvmAddressSchema
} from "./common.js";
import {
  optionalVerificationTextSchema,
  optionalVerificationUrlSchema,
  riskLevelSchema,
  verificationStatusSchema
} from "./token.js";

export const routerUpdateSchema = z.object({
  chainId: baseChainIdSchema.optional(),
  name: z.string().trim().min(1).optional(),
  address: optionalEvmAddressSchema.optional(),
  spenderAddress: optionalEvmAddressSchema.optional(),
  txTargetAddress: optionalEvmAddressSchema.optional(),
  allowanceTargetAddress: optionalEvmAddressSchema.optional(),
  functionSelectorAllowlist: z
    .record(z.string(), z.array(z.string().regex(/^0x[0-9a-fA-F]{8}$/)))
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
  riskLevel: riskLevelSchema.optional(),
  verificationStatus: verificationStatusSchema.optional(),
  verificationSource: optionalVerificationTextSchema,
  verificationEvidenceUrl: optionalVerificationUrlSchema,
  verifiedBy: optionalVerificationTextSchema,
  verificationNotes: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().nullable().optional()
});
