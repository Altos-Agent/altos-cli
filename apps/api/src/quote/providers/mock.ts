import type { NormalizedQuote, QuoteProvider, QuoteRequest } from "../types.js";

export class MockQuoteProvider implements QuoteProvider {
  readonly name = "mock" as const;

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    const sellAmount = Number(request.sellAmount);
    const buyAmount = Number.isFinite(sellAmount)
      ? Math.max(sellAmount * 0.99, 0).toFixed(6)
      : "0";

    return {
      provider: this.name,
      routerName: request.routerName ?? "Mock Router",
      sellToken: request.sellToken.symbol,
      buyToken: request.buyToken.symbol,
      sellAmount: request.sellAmount,
      buyAmount,
      estimatedGas: {
        gasUsed: "180000",
        gasUsd: "2.50",
        feeNative: "0.0007"
      },
      allowanceTarget: null,
      txTo: null,
      txData: null,
      warnings: ["Mock quote for local dry-run testing only"],
      rawResponse: null
    };
  }
}
