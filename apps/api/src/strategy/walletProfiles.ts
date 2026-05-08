import type { Wallet, WalletPairRule } from "../db/schema.js";

export const isWalletActive = (wallet: Wallet) => wallet.status === "ACTIVE";

export const isWalletPairRuleEnabled = (rule: WalletPairRule | null) =>
  rule?.enabled === true;
