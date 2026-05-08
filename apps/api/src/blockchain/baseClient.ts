import {
  BASE_CHAIN_ID,
  BASE_NATIVE_SYMBOL
} from "@base-orchestrator/shared";
import { createPublicClient, defineChain, http } from "viem";

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
      http: [process.env.BASE_RPC_URL ?? "https://mainnet.base.org"]
    }
  },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: process.env.BASESCAN_BASE_URL ?? "https://basescan.org"
    }
  }
});

export const basePublicClient = createPublicClient({
  chain: baseMainnet,
  transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org")
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
    rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
    nativeSymbol: BASE_NATIVE_SYMBOL
  };
};
