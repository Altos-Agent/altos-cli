import type { NormalizedQuote, QuoteProvider, QuoteRequest } from "../types.js";
import { BASE_CHAIN_ID, formatTokenAmount } from "@base-orchestrator/shared";

const usdStableSymbols = new Set(["USDC", "USDbC", "DAI", "EURC"]);

const stableUsdAmount = (symbol: string, displayAmount: string) =>
  usdStableSymbols.has(symbol) ? Number(displayAmount).toFixed(2) : null;

export class MockQuoteProvider implements QuoteProvider {
  readonly name = "mock" as const;

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    const sellAmountRaw = BigInt(request.sellAmountRaw);
    const buyAmountRaw = (sellAmountRaw * 99n) / 100n;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30_000);
    const sellAmountUsd = stableUsdAmount(
      request.sellToken.symbol,
      request.sellAmountDisplay
    );
    const buyAmountDisplay = formatTokenAmount(
      buyAmountRaw,
      request.buyToken.decimals
    );
    const buyAmountUsd = stableUsdAmount(request.buyToken.symbol, buyAmountDisplay);

    return {
      chainId: BASE_CHAIN_ID,
      provider: this.name,
      routerName: request.routerName ?? "Mock Router",
      routerAddress: null,
      spenderAddress: null,
      sellToken: request.sellToken.symbol,
      buyToken: request.buyToken.symbol,
      sellTokenAddress: request.sellToken.address,
      buyTokenAddress: request.buyToken.address,
      sellAmountDisplay: request.sellAmountDisplay,
      sellAmountRaw: request.sellAmountRaw,
      buyAmountDisplay,
      buyAmountRaw: buyAmountRaw.toString(),
      sellAmountUsd,
      buyAmountUsd,
      minBuyAmountRaw: null,
      estimatedGas: {
        gasUsed: "180000",
        gasUsd: "2.50",
        feeNative: "0.0007"
      },
      allowanceTarget: null,
      txTo: null,
      txData: null,
      priceImpactBps: 100,
      slippageBps: 100,
      txValue: "0",
      usdPriceSource: sellAmountUsd ?? buyAmountUsd ? "mock-stablecoin-parity" : null,
      usdPriceTimestamp: sellAmountUsd ?? buyAmountUsd ? now : null,
      quoteUsdSource: sellAmountUsd ?? buyAmountUsd ? "mock" : null,
      quotedAt: now,
      quoteTimestamp: now,
      expiresAt,
      warnings: ["Mock quote for local dry-run testing only"],
      rawResponse: null
    };
  }
}
