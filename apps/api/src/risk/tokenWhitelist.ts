import type { Token } from "../db/schema.js";

export const checkTokenWhitelist = ({
  tokenIn,
  tokenOut
}: {
  tokenIn: Token | null;
  tokenOut: Token | null;
}) => {
  const reasons: string[] = [];

  if (!tokenIn) {
    reasons.push("Unknown input token");
  } else if (!tokenIn.enabled) {
    reasons.push("Input token is disabled");
  }

  if (!tokenOut) {
    reasons.push("Unknown output token");
  } else if (!tokenOut.enabled) {
    reasons.push("Output token is disabled");
  }

  return reasons;
};
