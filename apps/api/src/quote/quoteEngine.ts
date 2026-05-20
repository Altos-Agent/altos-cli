import type { QuoteProvider, QuoteRequest } from "./types.js";
import { normalizedQuoteSchema } from "@base-orchestrator/shared";
import { MockQuoteProvider } from "./providers/mock.js";
import { ZeroXQuoteProvider } from "./providers/zeroX.js";
import { getRuntimeConfig } from "../config/runtime-config.js";

export const getConfiguredQuoteProvider = (): QuoteProvider => {
  const provider = getRuntimeConfig().quoteProvider;

  if (provider === "0x" || provider === "zeroX") {
    return new ZeroXQuoteProvider();
  }

  return new MockQuoteProvider();
};

export const getQuote = async (
  request: QuoteRequest,
  provider: QuoteProvider = getConfiguredQuoteProvider()
) => normalizedQuoteSchema.parse(await provider.getQuote(request));
