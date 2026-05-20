import { maxUint256 } from "viem";
import { parseTokenAmount } from "@base-orchestrator/shared";
import { getRuntimeConfig } from "../config/runtime-config.js";

export const maxUint256String = maxUint256.toString();

export const allowUnlimitedApproval = () =>
  getRuntimeConfig().allowUnlimitedApproval;

export const parseApprovalAmount = (amount: string, decimals: number) => {
  try {
    return parseTokenAmount(amount, decimals).toString();
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
