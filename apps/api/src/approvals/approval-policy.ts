import { maxUint256, parseUnits } from "viem";

export const maxUint256String = maxUint256.toString();

export const allowUnlimitedApproval = () =>
  process.env.ALLOW_UNLIMITED_APPROVAL === "true";

export const parseApprovalAmount = (amount: string, decimals: number) => {
  try {
    return parseUnits(amount, decimals).toString();
  } catch {
    throw new Error("Approval amount must be a valid token amount");
  }
};

export const validateApprovalAmount = ({
  rawAmount,
  allowUnlimitedApproval: allowUnlimited = allowUnlimitedApproval()
}: {
  rawAmount: string;
  allowUnlimitedApproval?: boolean;
}) => {
  const reasons: string[] = [];
  let parsedAmount: bigint;

  try {
    parsedAmount = BigInt(rawAmount);
  } catch {
    return ["Approval amount must be a valid integer"];
  }

  if (parsedAmount <= 0n) {
    reasons.push("Approval amount must be greater than zero");
  }
  if (!allowUnlimited && parsedAmount === maxUint256) {
    reasons.push("Unlimited approval is disabled");
  }

  return reasons;
};
