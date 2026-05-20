import { z } from "zod";

export const tokenDecimalsSchema = z.number().int().min(0).max(36);

export const safeDecimalStringSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, {
    message: "Amount must be a non-negative decimal string"
  });

const assertDecimals = (decimals: number) => {
  tokenDecimalsSchema.parse(decimals);
};

export const parseTokenAmount = (
  displayAmount: string,
  decimals: number
): bigint => {
  assertDecimals(decimals);
  const amount = safeDecimalStringSchema.parse(displayAmount);
  const [whole = "0", fraction = ""] = amount.split(".");

  if (fraction.length > decimals) {
    throw new Error("Too many decimal places for token decimals");
  }

  const scale = 10n ** BigInt(decimals);
  const wholeRaw = BigInt(whole) * scale;
  const fractionRaw =
    fraction.length === 0
      ? 0n
      : BigInt(fraction.padEnd(decimals, "0"));

  return wholeRaw + fractionRaw;
};

export const formatTokenAmount = (
  rawAmount: bigint,
  decimals: number
): string => {
  assertDecimals(decimals);
  if (rawAmount < 0n) {
    throw new Error("Raw token amount must be non-negative");
  }

  if (decimals === 0) {
    return rawAmount.toString();
  }

  const scale = 10n ** BigInt(decimals);
  const whole = rawAmount / scale;
  const fraction = rawAmount % scale;
  const fractionText = fraction.toString().padStart(decimals, "0");
  const trimmedFraction = fractionText.replace(/0+$/, "");

  return trimmedFraction.length > 0
    ? `${whole.toString()}.${trimmedFraction}`
    : whole.toString();
};
