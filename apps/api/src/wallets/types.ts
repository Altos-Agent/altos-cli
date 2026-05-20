import type { Wallet } from "../db/schema.js";

export interface ImportWalletInput {
  name: string;
  privateKey: string;
  address?: string | undefined;
  maxTradeUsd?: string | number | null | undefined;
  maxDailyTrades?: string | number | null | undefined;
  maxDailyLossUsd?: string | number | null | undefined;
  maxGasUsd?: string | number | null | undefined;
  notes?: string | null | undefined;
}

export interface UpdateWalletInput {
  name?: string | undefined;
  status?: "ACTIVE" | "PAUSED" | "DISABLED" | undefined;
  maxTradeUsd?: string | number | null | undefined;
  maxDailyTrades?: string | number | null | undefined;
  maxDailyLossUsd?: string | number | null | undefined;
  maxGasUsd?: string | number | null | undefined;
  notes?: string | null | undefined;
}

export type SafeWallet = Omit<Wallet, "encryptedPrivateKey" | "encryptionVersion">;
