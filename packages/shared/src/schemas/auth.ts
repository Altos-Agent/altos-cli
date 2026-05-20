import { z } from "zod";

export const authLoginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

export const vaultUnlockSchema = z
  .object({
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    passphrase: z.string().min(1).optional()
  })
  .refine(
    (value) =>
      (value.username !== undefined && value.password !== undefined) ||
      value.passphrase !== undefined,
    {
      message: "Vault unlock requires operator credentials or passphrase"
    }
  );
