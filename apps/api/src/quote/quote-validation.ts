import { BASE_CHAIN_ID, normalizedQuoteSchema } from "@base-orchestrator/shared";
import type { Pair, Router, Token, Wallet } from "../db/schema.js";
import type { NormalizedQuote } from "./types.js";
import {
  assertPairVerifiedForLive,
  assertQuoteTargetVerifiedForLive,
  routerAllowanceTargetAddress,
  routerTxTargetAddress,
} from "../risk/verification.js";

const normalizeAddress = (value: string | null | undefined) =>
  value ? value.toLowerCase() : null;

const isPositiveRawAmount = (value: string) => {
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
};

const enabledRouterAddresses = (routers: Router[]) =>
  new Set(
    routers
      .filter((router) => router.enabled && router.address)
      .map((router) => normalizeAddress(router.address) as string)
  );

const resolveEnabledRouter = (
  quote: NormalizedQuote,
  routers: Router[]
) => {
  const routerAddress = normalizeAddress(quote.routerAddress ?? quote.txTo);
  return routers.find((router) => {
    if (!router.enabled || router.chainId !== BASE_CHAIN_ID) return false;
    if (routerAddress && normalizeAddress(router.address) === routerAddress) {
      return true;
    }
  return router.name === quote.routerName;
  }) ?? null;
};

const targetRouterAddresses = (routers: Router[]) =>
  new Set(
    routers
      .filter((router) => router.enabled && router.address && router.verificationStatus === "VERIFIED")
      .flatMap((router) => [
        router.address,
        routerTxTargetAddress(router),
        routerAllowanceTargetAddress(router)
      ])
      .filter((address): address is string => Boolean(address))
      .map((address) => normalizeAddress(address) as string)
  );

const selector = (txData: string | null) =>
  txData && txData.length >= 10 ? txData.slice(0, 10).toLowerCase() : null;

export interface QuoteExecutionValidationInput {
  quote: NormalizedQuote;
  wallet: Wallet;
  pair: Pair;
  sellToken: Token | null;
  buyToken: Token | null;
  sellAmountRaw: string | null;
  routers: Router[];
  live: boolean;
  now?: Date;
  nativeValueSwapsEnabled?: boolean;
  maxNativeValueWei?: string;
  functionSelectorAllowlist?: Record<string, string[]>;
}

export const validateQuoteForExecution = (
  input: QuoteExecutionValidationInput
) => {
  const reasons: string[] = [];
  const now = input.now ?? new Date();
  const parsed = normalizedQuoteSchema.safeParse(input.quote);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path.join(".") === "chainId") {
        reasons.push(`Quote chainId must be ${BASE_CHAIN_ID}`);
      } else if (issue.path.join(".") === "buyAmountRaw") {
        reasons.push("Quote buy amount must be greater than zero");
      } else {
        reasons.push(`Quote schema invalid: ${issue.path.join(".") || issue.message}`);
      }
    }
    return {
      accepted: false,
      rejected: true,
      reasons
    };
  }

  const quote = parsed.data;
  const allowedRouters = enabledRouterAddresses(input.routers);
  const allowedTargets = targetRouterAddresses(input.routers);
  const resolvedRouter = resolveEnabledRouter(quote, input.routers);
  const quoteRouterAddress = normalizeAddress(quote.routerAddress);
  const spenderAddress = normalizeAddress(
    quote.spenderAddress ?? quote.allowanceTarget
  );
  const txTo = normalizeAddress(quote.txTo);
  const sellTokenAddress = normalizeAddress(input.sellToken?.address);
  const buyTokenAddress = normalizeAddress(input.buyToken?.address);
  const quoteSellTokenAddress = normalizeAddress(quote.sellTokenAddress);
  const quoteBuyTokenAddress = normalizeAddress(quote.buyTokenAddress);

  if (quote.chainId !== BASE_CHAIN_ID) {
    reasons.push(`Quote chainId must be ${BASE_CHAIN_ID}`);
  }
  if (!resolvedRouter || (quoteRouterAddress && !allowedRouters.has(quoteRouterAddress))) {
    reasons.push("Quote router is not enabled");
  }
  if (spenderAddress && !allowedTargets.has(spenderAddress)) {
    reasons.push("Quote spender is not verified");
  }
  if (
    sellTokenAddress &&
    quoteSellTokenAddress &&
    quoteSellTokenAddress !== sellTokenAddress
  ) {
    reasons.push("Quote sell token does not match the pair");
  }
  if (
    buyTokenAddress &&
    quoteBuyTokenAddress &&
    quoteBuyTokenAddress !== buyTokenAddress
  ) {
    reasons.push("Quote buy token does not match the pair");
  }
  if (quote.sellAmountRaw !== input.sellAmountRaw) {
    reasons.push("Quote sell amount does not match the request");
  }
  if (input.live && !quote.txData) {
    reasons.push("Quote transaction data is required for live execution");
  }
  if (input.live && (!txTo || !allowedTargets.has(txTo))) {
    reasons.push("Quote transaction target is not verified");
  }
  if (
    input.live &&
    quoteRouterAddress &&
    txTo &&
    quoteRouterAddress !== txTo
  ) {
    reasons.push("Quote transaction target does not match the router");
  }
  if (!input.nativeValueSwapsEnabled && BigInt(quote.txValue) > 0n) {
    reasons.push("Native value swaps are disabled");
  }
  if (
    input.nativeValueSwapsEnabled &&
    input.maxNativeValueWei &&
    BigInt(quote.txValue) > BigInt(input.maxNativeValueWei)
  ) {
    reasons.push("Native value exceeds configured cap");
  }
  if (now.getTime() > quote.expiresAt.getTime()) {
    reasons.push("Quote is stale or expired");
  }
  if (
    quote.priceImpactBps !== null &&
    input.pair.maxPriceImpactBps !== null &&
    quote.priceImpactBps > input.pair.maxPriceImpactBps
  ) {
    reasons.push(
      `Price impact exceeds max price impact of ${input.pair.maxPriceImpactBps} bps`
    );
  }
  if (
    input.pair.maxSlippageBps !== null &&
    quote.slippageBps > input.pair.maxSlippageBps
  ) {
    reasons.push(`Slippage exceeds max slippage of ${input.pair.maxSlippageBps} bps`);
  }
  if (!isPositiveRawAmount(quote.buyAmountRaw)) {
    reasons.push("Quote buy amount must be greater than zero");
  }

  if (input.live && input.sellToken && input.buyToken) {
    try {
      assertPairVerifiedForLive({
        pair: input.pair,
        tokenIn: input.sellToken,
        tokenOut: input.buyToken,
      });
      assertQuoteTargetVerifiedForLive({ quote, routers: input.routers });
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : "Quote target verification failed");
    }
  }

  const allowedSelectors =
    input.functionSelectorAllowlist?.[quote.routerName] ??
    input.functionSelectorAllowlist?.[resolvedRouter?.name ?? ""] ??
    ((resolvedRouter?.functionSelectorAllowlist as Record<string, string[]> | null | undefined)?.[
      quote.routerName
    ] ??
      (resolvedRouter?.functionSelectorAllowlist as Record<string, string[]> | null | undefined)?.[
        resolvedRouter?.name ?? ""
      ]);
  const quoteSelector = selector(quote.txData);
  if (
    input.live &&
    allowedSelectors &&
    quoteSelector &&
    !allowedSelectors.map((value) => value.toLowerCase()).includes(quoteSelector)
  ) {
    reasons.push("Quote calldata function selector is not allowed for router");
  }

  return {
    accepted: reasons.length === 0,
    rejected: reasons.length > 0,
    reasons
  };
};
