import type { Token, Router } from "../db/schema.js";
import { canUseInLiveMode } from "./verification.js";

export const verificationStatusForLive = (
  entity: Token | Router,
): "LIVE_READY" | "UNVERIFIED" | "BLOCKED" => {
  if (canUseInLiveMode(entity)) return "LIVE_READY";
  if (entity.verificationStatus === "BLOCKED" || entity.verificationStatus === "PLACEHOLDER") return "BLOCKED";
  return "UNVERIFIED";
};

export const formatVerificationBadge = (entity: Token | Router): string => {
  const status = entity.verificationStatus;
  if (status === "VERIFIED") return "[VERIFIED]";
  if (status === "BLOCKED") return "[BLOCKED]";
  if (status === "PLACEHOLDER") return "[PLACEHOLDER]";
  return "[UNVERIFIED]";
};

export const getVerificationSummary = (
  token: Token,
): string => {
  const parts: string[] = [];
  parts.push(`Status: ${token.verificationStatus}`);
  if (token.verificationSource) parts.push(`Source: ${token.verificationSource}`);
  if (token.verifiedBy) parts.push(`By: ${token.verifiedBy}`);
  if (token.verifiedAt) parts.push(`At: ${token.verifiedAt.toISOString()}`);
  if (token.verificationNotes) parts.push(`Notes: ${token.verificationNotes}`);
  return parts.join(" | ");
};