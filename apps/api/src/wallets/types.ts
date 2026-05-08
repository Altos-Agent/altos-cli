import type { Wallet } from "../db/schema.js";

export interface ImportWalletInput {
  name: string;
  privateKey: string;
  address?: string;
  maxTradeUsd?: string | number | null;
  maxDailyTrades?: string | number | null;
  maxDailyLossUsd?: string | number | null;
  maxGasUsd?: string | number | null;
  notes?: string | null;
}

export interface UpdateWalletInput {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "DISABLED";
  maxTradeUsd?: string | number | null;
  maxDailyTrades?: string | number | null;
  maxDailyLossUsd?: string | number | null;
  maxGasUsd?: string | number | null;
  notes?: string | null;
}

export type SafeWallet = Omit<Wallet, "encryptedPrivateKey" | "encryptionVersion">;
