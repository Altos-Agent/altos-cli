import type { Token, Wallet } from "../db/schema.js";

export interface QuoteRequest {
  wallet: Wallet;
  sellToken: Token;
  buyToken: Token;
  sellAmount: string;
  routerName?: string | null;
}

export interface NormalizedQuote {
  provider: "mock" | "zeroX";
  routerName: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  estimatedGas: {
    gasUsed: string;
    gasUsd: string;
    feeNative: string;
  };
  allowanceTarget: string | null;
  txTo: string | null;
  txData: string | null;
  warnings: string[];
  rawResponse: unknown | null;
}

export interface QuoteProvider {
  readonly name: "mock" | "zeroX";
  getQuote(request: QuoteRequest): Promise<NormalizedQuote>;
}
