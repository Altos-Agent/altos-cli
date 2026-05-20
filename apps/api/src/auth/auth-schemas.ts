import { z } from "zod";

export const confirmationSchema = z.object({
  confirm: z.string(),
  reauthToken: z.string().optional(),
});

export const reauthSchema = z.object({
  password: z.string().min(1),
});

export const mfaVerifySetupSchema = z.object({
  totpCode: z.string().regex(/^\d{6}$/, "Must be 6 digits"),
});

export const mfaDisableSchema = z.object({
  totpCode: z.string().regex(/^\d{6}$/, "Must be 6 digits"),
  password: z.string().min(1),
});

export const mfaVerifyLoginSchema = z.object({
  tempSessionId: z.string(),
  totpCode: z.string().regex(/^\d{6}$/, "Must be 6 digits"),
});

export const CONFIRM_PHRASES = {
  PURGE_SCHEDULER: "PURGE SCHEDULER QUEUES",
  DISABLE_EMERGENCY_PAUSE: "DISABLE EMERGENCY PAUSE",
  EXPORT_BACKUP: "EXPORT BACKUP",
  IMPORT_BACKUP: "IMPORT BACKUP",
  EXECUTE_LIVE_TRADE: "EXECUTE LIVE TRADE",
  APPROVE_LIVE: "APPROVE LIVE",
  REVOKE_APPROVAL: "REVOKE APPROVAL",
  INCREASE_RISK_LIMITS: "INCREASE RISK LIMITS",
  CHANGE_VERIFIED_STATUS: "CHANGE VERIFIED STATUS",
} as const;