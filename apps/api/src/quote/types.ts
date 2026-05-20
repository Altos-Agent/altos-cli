import type { Token, Wallet } from "../db/schema.js";

export interface QuoteRequest {
  wallet: Wallet;
  sellToken: Token;
  buyToken: Token;
  sellAmountDisplay: string;
  sellAmountRaw: string;
  routerName?: string | null;
}

export interface NormalizedQuote {
  chainId: number;
  provider: "mock" | "zeroX";
  routerName: string;
  routerAddress: string | null;
  spenderAddress: string | null;
  sellToken: string;
  buyToken: string;
  sellTokenAddress: string | null;
  buyTokenAddress: string | null;
  sellAmountDisplay: string;
  sellAmountRaw: string;
  buyAmountDisplay: string;
  buyAmountRaw: string;
  sellAmountUsd: string | null;
  buyAmountUsd: string | null;
  minBuyAmountRaw: string | null;
  estimatedGas: {
    gasUsed: string;
    gasUsd: string;
    feeNative: string;
  };
  allowanceTarget: string | null;
  txTo: string | null;
  txData: string | null;
  priceImpactBps: number | null;
  slippageBps: number;
  txValue: string;
  usdPriceSource: string | null;
  usdPriceTimestamp: Date | null;
  quoteUsdSource: string | null;
  quotedAt: Date;
  quoteTimestamp: Date;
  expiresAt: Date;
  warnings: string[];
  rawResponse: unknown | null;
}

export interface QuoteProvider {
  readonly name: "mock" | "zeroX";
  getQuote(request: QuoteRequest): Promise<NormalizedQuote>;
}
