import { z } from "zod";

export const telegramSettingsSchema = z.object({
  enabled: z.boolean(),
  botToken: z.string().min(1).nullable().optional(),
  chatId: z.string().min(1).nullable(),
  notifyOnSubmitted: z.boolean(),
  notifyOnConfirmed: z.boolean(),
  notifyOnFailed: z.boolean(),
  notifyOnRejected: z.boolean(),
  notifyOnDryRun: z.boolean()
}).partial();
