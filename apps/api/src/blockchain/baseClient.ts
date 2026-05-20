import {
  BASE_CHAIN_ID,
  BASE_NATIVE_SYMBOL
} from "@base-orchestrator/shared";
import { createPublicClient, defineChain, http } from "viem";
import { getRuntimeConfig } from "../config/runtime-config.js";

export const baseMainnet = defineChain({
  id: BASE_CHAIN_ID,
  name: "Base",
  nativeCurrency: {
    name: "Ether",
    symbol: BASE_NATIVE_SYMBOL,
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: [getRuntimeConfig().baseRpcUrl]
    }
  },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: getRuntimeConfig().basescanBaseUrl
    }
  }
});

export const basePublicClient = createPublicClient({
  chain: baseMainnet,
  transport: http(getRuntimeConfig().baseRpcUrl)
});

export type BasePublicClient = typeof basePublicClient;

export const getBaseChainStatus = async (
  client: BasePublicClient = basePublicClient
) => {
  const [chainId, latestBlockNumber] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber()
  ]);

  return {
    chainId,
    latestBlockNumber: latestBlockNumber.toString(),
    rpcUrl: getRuntimeConfig().baseRpcUrl,
    nativeSymbol: BASE_NATIVE_SYMBOL
  };
};
