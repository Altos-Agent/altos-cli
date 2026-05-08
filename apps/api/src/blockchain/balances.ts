import {
  erc20Abi,
  formatUnits,
  getAddress,
  parseUnits,
  type Address,
} from "viem";
import { BASE_CHAIN_ID, BASE_NATIVE_SYMBOL } from "@base-orchestrator/shared";
import type { BasePublicClient } from "./baseClient.js";
import { basePublicClient } from "./baseClient.js";
import type { Token } from "../db/schema.js";

export interface NativeBalanceResult {
  kind: "native";
  chainId: typeof BASE_CHAIN_ID;
  symbol: typeof BASE_NATIVE_SYMBOL;
  balanceRaw: string;
  balanceFormatted: string;
  decimals: 18;
}

export interface TokenBalanceResult {
  kind: "erc20";
  tokenId: string;
  chainId: number;
  symbol: string;
  name: string;
  address: string | null;
  decimals: number;
  enabled: boolean;
  balanceRaw: string | null;
  balanceFormatted: string | null;
  skippedReason?: string;
}

export const readNativeEthBalance = async (
  walletAddress: string,
  client: BasePublicClient = basePublicClient,
): Promise<NativeBalanceResult> => {
  const address = getAddress(walletAddress);
  const balance = await client.getBalance({ address });

  return {
    kind: "native",
    chainId: BASE_CHAIN_ID,
    symbol: BASE_NATIVE_SYMBOL,
    balanceRaw: balance.toString(),
    balanceFormatted: formatUnits(balance, 18),
    decimals: 18,
  };
};

export const readErc20TokenBalance = async (
  walletAddress: string,
  token: Token,
  client: BasePublicClient = basePublicClient,
): Promise<TokenBalanceResult> => {
  if (!token.address) {
    return {
      kind: "erc20",
      tokenId: token.id,
      chainId: token.chainId,
      symbol: token.symbol,
      name: token.name,
      address: null,
      decimals: token.decimals,
      enabled: token.enabled,
      balanceRaw: null,
      balanceFormatted: null,
      skippedReason: "Token contract address is not verified yet",
    };
  }

  const wallet = getAddress(walletAddress);
  const tokenAddress = getAddress(token.address) as Address;
  const balance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [wallet],
  });

  return {
    kind: "erc20",
    tokenId: token.id,
    chainId: token.chainId,
    symbol: token.symbol,
    name: token.name,
    address: tokenAddress,
    decimals: token.decimals,
    enabled: token.enabled,
    balanceRaw: balance.toString(),
    balanceFormatted: formatUnits(balance, token.decimals),
  };
};

export const readWalletBalances = async (
  walletAddress: string,
  tokenRows: Token[],
  client: BasePublicClient = basePublicClient,
) => {
  const native = await readNativeEthBalance(walletAddress, client);
  const erc20 = await Promise.all(
    tokenRows.map((token) =>
      readErc20TokenBalance(walletAddress, token, client),
    ),
  );

  return {
    address: getAddress(walletAddress),
    chainId: BASE_CHAIN_ID,
    native,
    tokens: erc20,
  };
};

export const readDemoWalletBalances = (
  walletAddress: string,
  tokenRows: Token[],
) => {
  const tokenBalances: Record<string, string> = walletAddress.endsWith("d01")
    ? {
        USDC: "1250.500000",
        WETH: "0.420000000000000000",
        DAI: "300.000000000000000000",
      }
    : {
        USDC: "740.250000",
        WETH: "0.180000000000000000",
        DAI: "950.000000000000000000",
      };

  return {
    address: getAddress(walletAddress),
    chainId: BASE_CHAIN_ID,
    native: {
      kind: "native" as const,
      chainId: BASE_CHAIN_ID,
      symbol: BASE_NATIVE_SYMBOL,
      balanceRaw: walletAddress.endsWith("d01")
        ? "420000000000000000"
        : "180000000000000000",
      balanceFormatted: walletAddress.endsWith("d01") ? "0.42" : "0.18",
      decimals: 18 as const,
    },
    tokens: tokenRows.map((token) => {
      const balanceFormatted = tokenBalances[token.symbol] ?? "0";

      return {
        kind: "erc20" as const,
        tokenId: token.id,
        chainId: token.chainId,
        symbol: token.symbol,
        name: token.name,
        address: token.address,
        decimals: token.decimals,
        enabled: token.enabled,
        balanceRaw: parseUnits(balanceFormatted, token.decimals).toString(),
        balanceFormatted,
        skippedReason: undefined,
      };
    }),
  };
};
