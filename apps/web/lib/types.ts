export type WalletStatus = "ACTIVE" | "PAUSED" | "DISABLED";
export type TransactionStatus =
  | "PLANNED"
  | "DRY_RUN"
  | "SUBMITTED"
  | "CONFIRMED"
  | "FAILED"
  | "REJECTED";
export type TransactionAction =
  | "SWAP"
  | "APPROVE"
  | "TRANSFER"
  | "REVOKE"
  | "SIMULATION";

export interface ChainStatus {
  chainId: number;
  latestBlockNumber: string;
  rpcUrl: string;
  nativeSymbol: string;
}

export interface Wallet {
  id: string;
  name: string;
  address: string;
  status: WalletStatus;
  maxTradeUsd: string | null;
  maxDailyTrades: number | null;
  maxDailyLossUsd: string | null;
  maxGasUsd: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletProfile {
  id:
    | "conservative"
    | "stable-only"
    | "low-fee"
    | "token-rotation-limited"
    | "manual-only";
  name: string;
  maxTradeUsd: string;
  maxDailyTrades: number;
  maxDailyLossUsd: string;
  maxGasUsd: string;
  allowedRiskLevel: RiskLevel;
  defaultPairs: string[];
  scheduleDefaults: {
    enabled: boolean;
    tradeAmountUsd: string;
    minIntervalMinutes: number;
    maxDailyTrades: number;
    strategyProfile: StrategyProfile;
    failedTxPauseThreshold: number;
    emergencyPaused: boolean;
  };
}

export interface EncryptedWalletBackup {
  format: "base-orchestrator.encrypted-wallet-backup";
  version: 1;
  exportedAt: string;
  masterKeyFingerprint: string;
  wallets: {
    name: string;
    address: string;
    encryptedPrivateKey: string;
    encryptionVersion: number;
    status?: WalletStatus;
    maxTradeUsd?: string | null;
    maxDailyTrades?: number | null;
    maxDailyLossUsd?: string | null;
    maxGasUsd?: string | null;
    notes?: string | null;
  }[];
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface Token {
  id: string;
  chainId: number;
  symbol: string;
  name: string;
  address: string | null;
  decimals: number;
  riskLevel: RiskLevel;
  maxTradeUsd: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pair {
  id: string;
  chainId: number;
  tokenInId: string;
  tokenOutId: string;
  enabled: boolean;
  maxTradeUsd: string | null;
  maxSlippageBps: number | null;
  maxPriceImpactBps: number | null;
  preferredRouter: string | null;
  fallbackRouter: string | null;
  createdAt: string;
  updatedAt: string;
  tokenIn: Token | null;
  tokenOut: Token | null;
}

export interface RouterConfig {
  id: string;
  chainId: number;
  name: string;
  address: string | null;
  enabled: boolean;
  riskLevel: RiskLevel;
  notes: string | null;
}

export interface WalletPairRule {
  pair: Pair;
  rule: {
    id: string;
    walletId: string;
    pairId: string;
    enabled: boolean;
    maxTradeUsd: string | null;
    maxDailyTrades: number | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export interface NativeBalance {
  kind: "native";
  chainId: number;
  symbol: string;
  balanceRaw: string;
  balanceFormatted: string;
  decimals: 18;
}

export interface TokenBalance {
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

export interface WalletBalances {
  wallet: Pick<Wallet, "id" | "address" | "name">;
  balances: {
    address: string;
    chainId: number;
    native: NativeBalance;
    tokens: TokenBalance[];
  };
}

export interface WalletBasescan {
  walletId: string;
  address: string;
  basescanUrl: string;
}

export interface Transaction {
  id: string;
  walletId: string;
  walletName?: string;
  walletAddress?: string;
  action: TransactionAction;
  status: TransactionStatus;
  pairId: string | null;
  pair: string | null;
  txHash: string | null;
  basescanUrl: string | null;
  createdAt: string;
  updatedAt: string;
  router?: string | null;
  tokenIn?: string | null;
  tokenOut?: string | null;
  amountIn?: string | null;
  amountOut?: string | null;
  gasUsed?: string | null;
  gasUsd?: string | null;
  feeNative?: string | null;
  errorMessage?: string | null;
}

export interface TransactionRefreshResult {
  refreshed: boolean;
  reason: string | null;
  transaction: Transaction;
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

export interface DryRunPlanResult {
  accepted: boolean;
  rejected: boolean;
  reasons: string[];
  estimatedRoute: {
    chainId: number;
    router: string | null;
    tokenIn: string | null;
    tokenOut: string | null;
    amountIn: string;
  };
  estimatedGas: {
    gasUsed: string;
    gasUsd: string;
    feeNative: string;
  };
  estimatedCost: {
    amountUsd: string;
    estimatedGasUsd: string;
    estimatedTotalUsd: string;
  };
  basescanLinks: {
    wallet: string;
    tokenIn: string | null;
    tokenOut: string | null;
  };
  quote: NormalizedQuote | null;
  txHash: null;
  transactionId: string | null;
  status: "DRY_RUN" | "REJECTED";
}

export interface LiveExecutionStatus {
  dryRun: boolean;
  demoMode?: boolean;
  requireLiveConfirmation: boolean;
  liveExecutionEnabled: boolean;
}

export interface ExecuteOnceResult {
  accepted: boolean;
  rejected: boolean;
  reasons: string[];
  status?: "SUBMITTED" | "FAILED" | "REJECTED" | "NEEDS_APPROVAL";
  txHash?: string | null;
  basescanUrl?: string | null;
  transactionId: string | null;
  requiredApproval?: {
    tokenId: string;
    routerId: string | null;
    allowanceRaw: string;
    requiredRaw: string;
  };
}

export interface WalletAllowance {
  token: Pick<
    Token,
    "id" | "symbol" | "name" | "address" | "decimals" | "enabled"
  >;
  router: Pick<RouterConfig, "id" | "name" | "address" | "enabled">;
  allowanceRaw: string | null;
  allowanceFormatted: string | null;
  isNonZero: boolean;
  isUnlimited: boolean;
  skippedReason: string | null;
}

export interface ApprovalActionResult {
  accepted: boolean;
  rejected: boolean;
  reasons: string[];
  status: "SUBMITTED" | "FAILED" | "REJECTED";
  txHash: string | null;
  basescanUrl: string | null;
  transactionId: string | null;
}

export interface QuoteResponse {
  quote: NormalizedQuote | null;
  riskEvaluation: {
    accepted: boolean;
    rejected: boolean;
    reasons: string[];
  };
  accepted: boolean;
  rejected: boolean;
}

export interface TelegramSettings {
  id: string;
  enabled: boolean;
  tokenPreview: string | null;
  chatId: string | null;
  notifyOnSubmitted: boolean;
  notifyOnConfirmed: boolean;
  notifyOnFailed: boolean;
  notifyOnRejected: boolean;
  notifyOnDryRun: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardSummary {
  activeWallets: number;
  pausedWallets: number;
  totalSubmittedTx: number;
  confirmedTx: number;
  failedTx: number;
  dryRunStatus: "Enabled" | "Disabled";
  telegramStatus: "Enabled" | "Disabled";
  chainStatus: ChainStatus | null;
  schedulerStatus: SchedulerStatus | null;
}

export type StrategyProfile =
  | "MANUAL_ONLY"
  | "STABLE_ONLY"
  | "LOW_FEE_ONLY"
  | "TOKEN_ROTATION_LIMITED";

export interface SchedulerStatus {
  started: boolean;
  dryRun: boolean;
  liveSchedulerEnabled: boolean;
  queues: Record<
    "quoteQueue" | "tradeQueue" | "confirmationQueue" | "notificationQueue",
    Record<string, number>
  >;
}

export interface WalletSchedule {
  id: string | null;
  walletId: string;
  enabled: boolean;
  tradeAmountUsd: string;
  minIntervalMinutes: number;
  maxDailyTrades: number | null;
  strategyProfile: StrategyProfile;
  emergencyPaused: boolean;
  failedTxPauseThreshold: number;
  lastScheduledAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
