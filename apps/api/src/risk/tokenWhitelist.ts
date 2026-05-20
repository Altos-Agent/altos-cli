import type { Token } from "../db/schema.js";
import { BLOCKED_STATUSES } from "./verification.js";

export const checkTokenWhitelist = ({
  tokenIn,
  tokenOut,
}: {
  tokenIn: Token | null;
  tokenOut: Token | null;
}) => {
  const reasons: string[] = [];

  if (!tokenIn) {
    reasons.push("Unknown input token");
  } else if (!tokenIn.enabled) {
    reasons.push("Input token is disabled");
  } else if (BLOCKED_STATUSES.has(tokenIn.verificationStatus)) {
    reasons.push(
      `Input token ${tokenIn.symbol} is ${tokenIn.verificationStatus} and cannot be used`,
    );
  } else if (tokenIn.verificationStatus === "UNVERIFIED") {
    reasons.push(
      `Input token ${tokenIn.symbol} is UNVERIFIED — mark VERIFIED or BLOCKED before live use`,
    );
  }

  if (!tokenOut) {
    reasons.push("Unknown output token");
  } else if (!tokenOut.enabled) {
    reasons.push("Output token is disabled");
  } else if (BLOCKED_STATUSES.has(tokenOut.verificationStatus)) {
    reasons.push(
      `Output token ${tokenOut.symbol} is ${tokenOut.verificationStatus} and cannot be used`,
    );
  } else if (tokenOut.verificationStatus === "UNVERIFIED") {
    reasons.push(
      `Output token ${tokenOut.symbol} is UNVERIFIED — mark VERIFIED or BLOCKED before live use`,
    );
  }

  return reasons;
};