import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import type { NormalizedQuote, QuoteProvider, QuoteRequest } from "../types.js";

interface ZeroXQuoteResponse {
  buyAmount?: string;
  sellAmount?: string;
  gas?: string;
  allowanceTarget?: string;
  transaction?: {
    to?: string;
    data?: string;
    gas?: string;
  };
  to?: string;
  data?: string;
  warnings?: unknown[];
  issues?: unknown;
}

const maxRawResponseBytes = 20_000;

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

export class ZeroXQuoteProvider implements QuoteProvider {
  readonly name = "zeroX" as const;

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    if (!request.sellToken.address || !request.buyToken.address) {
      throw new Error("0x quotes require verified token contract addresses");
    }

    const searchParams = new URLSearchParams({
      chainId: String(BASE_CHAIN_ID),
      sellToken: request.sellToken.address,
      buyToken: request.buyToken.address,
      sellAmount: request.sellAmount,
      taker: request.wallet.address
    });
    const endpoint =
      process.env.ZEROX_SWAP_QUOTE_URL ??
      "https://api.0x.org/swap/allowance-holder/quote";
    const response = await fetch(`${endpoint}?${searchParams.toString()}`, {
      headers: {
        "0x-api-key": process.env.ZEROX_API_KEY ?? "",
        "0x-version": process.env.ZEROX_API_VERSION ?? "v2"
      }
    });

    if (!response.ok) {
      throw new Error(`0x quote request failed with ${response.status}`);
    }

    const raw = (await response.json()) as ZeroXQuoteResponse;
    const gasUsed = raw.transaction?.gas ?? raw.gas ?? "0";

    return {
      provider: this.name,
      routerName: request.routerName ?? "0x",
      sellToken: request.sellToken.symbol,
      buyToken: request.buyToken.symbol,
      sellAmount: raw.sellAmount ?? request.sellAmount,
      buyAmount: raw.buyAmount ?? "0",
      estimatedGas: {
        gasUsed,
        gasUsd: "0",
        feeNative: "0"
      },
      allowanceTarget: raw.allowanceTarget ?? null,
      txTo: raw.transaction?.to ?? raw.to ?? null,
      txData: raw.transaction?.data ?? raw.data ?? null,
      warnings: [
        ...(raw.warnings?.map((warning) => JSON.stringify(warning)) ?? []),
        ...(raw.issues ? [`issues: ${JSON.stringify(raw.issues)}`] : [])
      ],
      rawResponse: safeRawResponse(raw)
    };
  }
}
