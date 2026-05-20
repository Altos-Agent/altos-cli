import type { Pair, Router, Token, Wallet } from "../db/schema.js";
import type { NormalizedQuote } from "../quote/types.js";
import { validateQuoteForExecution } from "../quote/quote-validation.js";
import {
  routerAllowanceTargetAddress,
  routerTxTargetAddress,
} from "../risk/verification.js";

const normalizeAddress = (value: string) => value.toLowerCase();

export interface LiveExecutionSafetyInput {
  demoMode?: boolean;
  dryRunEnabled: boolean;
  requireLiveConfirmation: boolean;
  confirmLiveExecution: boolean;
  riskAccepted: boolean;
  riskReasons: string[];
  quote: NormalizedQuote | null;
  wallet?: Wallet;
  pair?: Pair;
  sellToken?: Token | null;
  buyToken?: Token | null;
  sellAmountRaw?: string | null;
  routers: Router[];
  simulated: boolean;
  now?: Date;
  nativeValueSwapsEnabled?: boolean;
  maxNativeValueWei?: string;
  functionSelectorAllowlist?: Record<string, string[]>;
}

export interface LiveExecutionSafetyResult {
  accepted: boolean;
  rejected: boolean;
  reasons: string[];
}

const isHexData = (value: string | null) =>
  typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);

const enabledRouterAddresses = (routers: Router[]) =>
  routers
    .filter((router) => router.enabled && router.address && router.verificationStatus === "VERIFIED")
    .flatMap((router) => [
      router.address,
      routerTxTargetAddress(router),
      routerAllowanceTargetAddress(router),
    ])
    .filter((address): address is string => Boolean(address))
    .map((address) => normalizeAddress(address));

export const evaluateLiveExecutionSafety = (
  input: LiveExecutionSafetyInput,
): LiveExecutionSafetyResult => {
  const reasons: string[] = [];
  const allowedRouterAddresses = enabledRouterAddresses(input.routers);

  if (input.demoMode) {
    reasons.push("Demo mode blocks live execution");
  }
  if (input.dryRunEnabled) {
    reasons.push("Global DRY_RUN must be false");
  }
  if (input.requireLiveConfirmation && !input.confirmLiveExecution) {
    reasons.push("Live execution confirmation is required");
  }
  if (!input.riskAccepted) {
    reasons.push(...input.riskReasons);
  }
  if (!input.quote) {
    reasons.push("Quote is required");
  }
  if (
    input.quote &&
    input.wallet &&
    input.pair &&
    input.sellAmountRaw !== undefined
  ) {
    const quoteValidationInput = {
      quote: input.quote,
      wallet: input.wallet,
      pair: input.pair,
      sellToken: input.sellToken ?? null,
      buyToken: input.buyToken ?? null,
      sellAmountRaw: input.sellAmountRaw,
      routers: input.routers,
      live: true,
      ...(input.now ? { now: input.now } : {}),
      ...(input.nativeValueSwapsEnabled === undefined
        ? {}
        : { nativeValueSwapsEnabled: input.nativeValueSwapsEnabled }),
      ...(input.maxNativeValueWei === undefined
        ? {}
        : { maxNativeValueWei: input.maxNativeValueWei }),
      ...(input.functionSelectorAllowlist === undefined
        ? {}
        : { functionSelectorAllowlist: input.functionSelectorAllowlist })
    };
    reasons.push(
      ...validateQuoteForExecution(quoteValidationInput).reasons
    );
  }
  if (input.quote && !input.quote.txTo) {
    reasons.push("Quote does not include a transaction target");
  }
  if (input.quote && !isHexData(input.quote.txData)) {
    reasons.push("Quote does not include transaction data");
  }
  if (
    input.quote?.txTo &&
    !allowedRouterAddresses.includes(normalizeAddress(input.quote.txTo))
  ) {
    reasons.push("Unknown transaction target");
  }
  if (
    input.quote?.allowanceTarget &&
    !allowedRouterAddresses.includes(
      normalizeAddress(input.quote.allowanceTarget),
    )
  ) {
    reasons.push("Unknown allowance target");
  }
  if (!input.simulated) {
    reasons.push("Transaction simulation must pass before sending");
  }

  return {
    accepted: reasons.length === 0,
    rejected: reasons.length > 0,
    reasons,
  };
};
