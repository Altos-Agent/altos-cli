import { BASE_CHAIN_ID, formatTokenAmount } from "@base-orchestrator/shared";
import { getRuntimeConfig } from "../../config/runtime-config.js";
import type { NormalizedQuote, QuoteProvider, QuoteRequest } from "../types.js";
import {
  ProviderRateLimitedError,
  ProviderUnavailableError,
  ProviderTimeoutError,
  StaleQuoteError,
  SimulationFailedError,
  HighPriceImpactError,
  HighSlippageError,
  InvalidQuoteTargetError,
  UnknownProviderError,
} from "../../errors/provider.errors.js";
import {
  withCircuitBreaker,
  type CircuitBreakerResult,
} from "../provider-circuit-breaker.js";

interface ZeroXQuoteResponse {
  buyAmount?: string;
  sellAmount?: string;
  minBuyAmount?: string;
  gas?: string;
  allowanceTarget?: string;
  transaction?: {
    to?: string;
    data?: string;
    gas?: string;
    value?: string;
  };
  to?: string;
  data?: string;
  value?: string;
  warnings?: unknown[];
  issues?: unknown;
}

const maxRawResponseBytes = 20_000;
const usdStableSymbols = new Set(["USDC", "USDbC", "DAI", "EURC"]);

const stableUsdAmount = (symbol: string, displayAmount: string) =>
  usdStableSymbols.has(symbol) ? Number(displayAmount).toFixed(2) : null;

const safeRawResponse = (value: unknown) => {
  const serialized = JSON.stringify(value);
  if (serialized.length > maxRawResponseBytes) {
    return {
      omitted: true,
      reason: "0x response exceeded safe raw response size"
    };
  }

  return value;
};

const mapResponseToQuote = (
  request: QuoteRequest,
  raw: ZeroXQuoteResponse,
): NormalizedQuote => {
  const gasUsed = raw.transaction?.gas ?? raw.gas ?? "0";
  const now = new Date();
  const buyAmountRaw = raw.buyAmount ?? "0";
  const txTo = raw.transaction?.to ?? raw.to ?? null;
  const txValue = raw.transaction?.value ?? raw.value ?? "0";
  const buyAmountDisplay = formatTokenAmount(
    BigInt(buyAmountRaw),
    request.buyToken.decimals,
  );
  const sellAmountUsd = stableUsdAmount(
    request.sellToken.symbol,
    request.sellAmountDisplay,
  );
  const buyAmountUsd = stableUsdAmount(request.buyToken.symbol, buyAmountDisplay);

  return {
    chainId: BASE_CHAIN_ID,
    provider: "zeroX",
    routerName: request.routerName ?? "0x",
    routerAddress: txTo,
    spenderAddress: raw.allowanceTarget ?? null,
    sellToken: request.sellToken.symbol,
    buyToken: request.buyToken.symbol,
    sellTokenAddress: request.sellToken.address,
    buyTokenAddress: request.buyToken.address,
    sellAmountDisplay: request.sellAmountDisplay,
    sellAmountRaw: raw.sellAmount ?? request.sellAmountRaw,
    buyAmountDisplay,
    buyAmountRaw,
    sellAmountUsd,
    buyAmountUsd,
    minBuyAmountRaw: raw.minBuyAmount ?? null,
    estimatedGas: {
      gasUsed,
      gasUsd: "0",
      feeNative: "0",
    },
    allowanceTarget: raw.allowanceTarget ?? null,
    txTo,
    txData: raw.transaction?.data ?? raw.data ?? null,
    priceImpactBps: null,
    slippageBps: 100,
    txValue,
    usdPriceSource: sellAmountUsd ?? buyAmountUsd ? "stablecoin-parity" : null,
    usdPriceTimestamp: sellAmountUsd ?? buyAmountUsd ? now : null,
    quoteUsdSource: sellAmountUsd ?? buyAmountUsd ? "0x" : null,
    quotedAt: now,
    quoteTimestamp: now,
    expiresAt: new Date(now.getTime() + 30_000),
    warnings: [
      ...(raw.warnings?.map((warning) => JSON.stringify(warning)) ?? []),
      ...(raw.issues ? [`issues: ${JSON.stringify(raw.issues)}`] : []),
    ],
    rawResponse: safeRawResponse(raw),
  };
};

export class ZeroXQuoteProvider implements QuoteProvider {
  readonly name = "zeroX" as const;

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    if (!request.sellToken.address || !request.buyToken.address) {
      throw new InvalidQuoteTargetError({
        provider: this.name,
        chainId: BASE_CHAIN_ID,
        walletId: request.wallet.id,
        retryable: false,
        internal: {
          missingSellToken: !request.sellToken.address,
          missingBuyToken: !request.buyToken.address,
        },
      });
    }

    const searchParams = new URLSearchParams({
      chainId: String(BASE_CHAIN_ID),
      sellToken: request.sellToken.address,
      buyToken: request.buyToken.address,
      sellAmount: request.sellAmountRaw,
      taker: request.wallet.address,
    });
    const config = getRuntimeConfig();
    const endpoint =
      config.zeroXSwapQuoteUrl ??
      "https://api.0x.org/swap/allowance-holder/quote";

    // Wrap the fetch call with circuit breaker
    const result: CircuitBreakerResult<ZeroXQuoteResponse> = await withCircuitBreaker(
      async () => {
        const response = await fetch(`${endpoint}?${searchParams.toString()}`, {
          headers: {
            "0x-api-key": config.zeroXApiKey,
            "0x-version": config.zeroXApiVersion,
          },
        });

        if (!response.ok) {
          const status = response.status;
          const statusText = response.statusText;

          if (status === 429) {
            throw new ProviderRateLimitedError({
              provider: this.name,
              chainId: BASE_CHAIN_ID,
              walletId: request.wallet.id,
              retryable: true,
              retryAfterMs: 30_000,
            });
          }

          if (status >= 500) {
            throw new ProviderUnavailableError({
              provider: this.name,
              chainId: BASE_CHAIN_ID,
              walletId: request.wallet.id,
              retryable: true,
              internal: { status, statusText },
            });
          }

          // Other client errors - not retryable
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new UnknownProviderError({
            provider: this.name,
            chainId: BASE_CHAIN_ID,
            walletId: request.wallet.id,
            retryable: false,
            internal: { status, statusText, errorBody },
          });
        }

        return response.json() as Promise<ZeroXQuoteResponse>;
      },
      (errorCode) => {
        // Callback when rate limited
        console.warn(`[zeroX] Rate limited: ${errorCode}`);
      },
    );

    if (!result.success) {
      if (result.rateLimited) {
        throw new ProviderRateLimitedError({
          provider: this.name,
          chainId: BASE_CHAIN_ID,
          walletId: request.wallet.id,
          retryable: true,
          retryAfterMs: 30_000,
        });
      }
      throw new UnknownProviderError({
        provider: this.name,
        chainId: BASE_CHAIN_ID,
        walletId: request.wallet.id,
        retryable: false,
        internal: { originalError: result.error },
      });
    }

    return mapResponseToQuote(request, result.data!);
  }
}
