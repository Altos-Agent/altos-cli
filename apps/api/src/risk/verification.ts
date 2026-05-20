import { isAddress } from "viem";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import type { Pair, Router, Token } from "../db/schema.js";
import type { NormalizedQuote } from "../quote/types.js";

export type VerificationStatus = "UNVERIFIED" | "VERIFIED" | "PLACEHOLDER" | "BLOCKED";

export interface VerificationMetadata {
  verificationStatus: VerificationStatus;
  verificationSource: string | null;
  verificationEvidenceUrl?: string | null;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
}

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationError";
  }
}

const normalizeAddress = (value: string | null | undefined) =>
  value ? value.toLowerCase() : null;

const isPlaceholderAddress = (value: string | null | undefined) => {
  const normalized = normalizeAddress(value);
  return (
    !normalized ||
    normalized === "0x0000000000000000000000000000000000000000" ||
    normalized.includes("placeholder")
  );
};

const requireBaseChain = (entityType: string, name: string, chainId: number) => {
  if (chainId !== BASE_CHAIN_ID) {
    throw new VerificationError(
      `${entityType} ${name} is configured for chain ${chainId}; live Base execution requires ${BASE_CHAIN_ID}`,
    );
  }
};

const requireEvidence = (
  entityType: string,
  name: string,
  entity: Pick<
    VerificationMetadata,
    "verificationSource" | "verificationEvidenceUrl" | "verifiedAt" | "verifiedBy"
  >,
) => {
  if (!entity.verificationSource || !entity.verificationEvidenceUrl || !entity.verifiedBy || !entity.verifiedAt) {
    throw new VerificationError(
      `${entityType} ${name} is VERIFIED but missing verification evidence, verifier, or timestamp`,
    );
  }
};

const requireVerifiedStatus = (
  entityType: string,
  name: string,
  entity: Pick<VerificationMetadata, "verificationStatus">,
) => {
  if (entity.verificationStatus !== "VERIFIED") {
    throw new VerificationError(
      `${entityType} ${name} is not verified (status: ${entity.verificationStatus}). Live execution requires VERIFIED configuration.`,
    );
  }
};

const requireEnabled = (
  entityType: string,
  name: string,
  entity: { enabled?: boolean },
) => {
  if (entity.enabled === false) {
    throw new VerificationError(`${entityType} ${name} is disabled.`);
  }
};

const requireLiveAddress = (
  entityType: string,
  name: string,
  address: string | null | undefined,
  checksumAddress?: string | null,
) => {
  if (isPlaceholderAddress(address) || !isAddress(address as string)) {
    throw new VerificationError(`${entityType} ${name} does not have a verified Base address.`);
  }
  if (
    checksumAddress &&
    normalizeAddress(checksumAddress) !== normalizeAddress(address)
  ) {
    throw new VerificationError(`${entityType} ${name} checksum address does not match configured address.`);
  }
};

export const routerSpenderAddress = (router: Router) =>
  router.spenderAddress ?? router.allowanceTargetAddress ?? router.address;

export const routerAllowanceTargetAddress = (router: Router) =>
  router.allowanceTargetAddress ?? router.spenderAddress ?? router.address;

export const routerTxTargetAddress = (router: Router) =>
  router.txTargetAddress ?? router.address;

export const isVerified = (entity: Pick<VerificationMetadata, "verificationStatus">) =>
  entity.verificationStatus === "VERIFIED";

export const isUnverifiedOrBlocked = (entity: Pick<VerificationMetadata, "verificationStatus">) =>
  entity.verificationStatus === "UNVERIFIED" || entity.verificationStatus === "BLOCKED";

export const requiresVerification = (
  entity: { verificationStatus: VerificationStatus; enabled?: boolean },
  requireEnabled = true,
) => {
  if (requireEnabled && entity.enabled === false) return false;
  return entity.verificationStatus !== "VERIFIED";
};

export const assertTokenVerifiedForLive = (token: Token): void => {
  requireBaseChain("Token", token.symbol, token.chainId);
  requireEnabled("Token", token.symbol, token);
  requireVerifiedStatus("Token", token.symbol, token);
  requireLiveAddress("Token", token.symbol, token.address, token.checksumAddress);
  requireEvidence("Token", token.symbol, token);
};

export const assertRouterVerifiedForLive = (router: Router): void => {
  requireBaseChain("Router", router.name, router.chainId);
  requireEnabled("Router", router.name, router);
  requireVerifiedStatus("Router", router.name, router);
  requireLiveAddress("Router", router.name, router.address, router.checksumAddress);
  requireLiveAddress("Router tx target", router.name, routerTxTargetAddress(router));
  requireLiveAddress("Router allowance target", router.name, routerAllowanceTargetAddress(router));
  requireEvidence("Router", router.name, router);
};

export const assertSpenderVerifiedForLive = ({
  spenderAddress,
  router,
}: {
  spenderAddress: string | null | undefined;
  router: Router;
}): void => {
  assertRouterVerifiedForLive(router);
  requireLiveAddress("Spender", router.name, spenderAddress);
  const expected = normalizeAddress(routerAllowanceTargetAddress(router));
  if (normalizeAddress(spenderAddress) !== expected) {
    throw new VerificationError(
      `Spender ${spenderAddress ?? "null"} does not match verified allowance target for router ${router.name}`,
    );
  }
};

export const assertPairVerifiedForLive = ({
  pair,
  tokenIn,
  tokenOut,
}: {
  pair: Pair;
  tokenIn: Token | null;
  tokenOut: Token | null;
}): void => {
  requireBaseChain("Pair", pair.id, pair.chainId);
  requireEnabled("Pair", pair.id, pair);
  requireVerifiedStatus("Pair", pair.id, pair);
  requireEvidence("Pair", pair.id, pair);
  if (!tokenIn || !tokenOut) {
    throw new VerificationError("Pair live verification requires both token records.");
  }
  assertTokenVerifiedForLive(tokenIn);
  assertTokenVerifiedForLive(tokenOut);
};

export const assertQuoteTargetVerifiedForLive = ({
  quote,
  routers,
}: {
  quote: NormalizedQuote;
  routers: Router[];
}): Router => {
  const router = routers.find((candidate) => {
    if (candidate.chainId !== BASE_CHAIN_ID) return false;
    const txTarget = normalizeAddress(routerTxTargetAddress(candidate));
    const routerAddress = normalizeAddress(candidate.address);
    const quoteRouter = normalizeAddress(quote.routerAddress);
    const quoteTo = normalizeAddress(quote.txTo);
    return (
      candidate.name === quote.routerName ||
      (quoteRouter !== null && quoteRouter === routerAddress) ||
      (quoteTo !== null && quoteTo === txTarget)
    );
  });

  if (!router) {
    throw new VerificationError("Quote target does not map to a configured Base router.");
  }

  assertRouterVerifiedForLive(router);

  const expectedTxTarget = normalizeAddress(routerTxTargetAddress(router));
  const expectedAllowanceTarget = normalizeAddress(routerAllowanceTargetAddress(router));
  const quoteTxTo = normalizeAddress(quote.txTo);
  const quoteRouterAddress = normalizeAddress(quote.routerAddress);
  const quoteSpender = normalizeAddress(quote.spenderAddress ?? quote.allowanceTarget);

  if (!quoteTxTo || quoteTxTo !== expectedTxTarget) {
    throw new VerificationError("Quote transaction target does not match the verified router target.");
  }
  if (quoteRouterAddress && quoteRouterAddress !== normalizeAddress(router.address)) {
    throw new VerificationError("Quote router address does not match the verified router contract.");
  }
  if (quoteSpender && quoteSpender !== expectedAllowanceTarget) {
    throw new VerificationError("Quote allowance target does not match the verified router spender.");
  }

  return router;
};

export const BLOCKED_STATUSES = new Set<VerificationStatus>(["BLOCKED", "PLACEHOLDER"]);

export const canUseInLiveMode = (entity: { verificationStatus: VerificationStatus; enabled?: boolean }) =>
  entity.enabled !== false && entity.verificationStatus === "VERIFIED";
