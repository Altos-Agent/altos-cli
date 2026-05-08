import type { QuoteProvider, QuoteRequest } from "./types.js";
import { MockQuoteProvider } from "./providers/mock.js";
import { ZeroXQuoteProvider } from "./providers/zeroX.js";

export const getConfiguredQuoteProvider = (): QuoteProvider => {
  const provider = process.env.QUOTE_PROVIDER ?? "mock";

  if (provider === "zeroX") {
    return new ZeroXQuoteProvider();
  }

  return new MockQuoteProvider();
};

export const getQuote = async (
  request: QuoteRequest,
  provider: QuoteProvider = getConfiguredQuoteProvider()
) => await provider.getQuote(request);
