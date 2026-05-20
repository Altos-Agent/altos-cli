export type WalletStatus = "ACTIVE" | "PAUSED" | "DISABLED";
export type TransactionStatus =
  | "PLANNED"
  | "DRY_RUN"
  | "SUBMITTED"
  | "CONFIRMED_PENDING_FINALITY"
  | "CONFIRMED"
  | "FINALIZED"
  | "FAILED"
  | "REJECTED"
  | "STUCK"
  | "DROPPED"
  | "REPLACED";
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

export interface AuthMe {
  authenticated: boolean;
  username: string | null;
}

export interface LoginResult {
  authenticated: boolean;
  username: string;
}

export interface CsrfResult {
  csrfToken: string;
}

export interface VaultStatus {
  status: "LOCKED" | "UNLOCKED";
  autoLockMs: number;
  unlockedUntil: string | null;
}

export interface EmergencyPauseStatus {
  globalEmergencyPaused: boolean;
  updatedAt: string;
}

export interface RuntimeStatus {
  demoMode: boolean;
  dryRun: boolean;
  liveExecutionAllowed: boolean;
  requireLiveConfirmation: boolean;
  schedulerLiveExecution: boolean;
  autoApprove: boolean;
  allowUnlimitedApproval: boolean;
  quoteProvider: "mock" | "0x" | "zeroX";
  baseChainId: number;
  baseRpcUrlMasked: string;
  vaultStatus: VaultStatus;
  emergencyPaused: boolean;
  authEnabled: boolean;
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
    strategyProfile: ScheduleStrategyProfile;
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
export type VerificationStatus = "UNVERIFIED" | "VERIFIED" | "PLACEHOLDER" | "BLOCKED";

export interface VerificationFields {
  verificationStatus: VerificationStatus;
  verificationSource: string | null;
  verificationEvidenceUrl: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
}

export interface Token extends VerificationFields {
  id: string;
  chainId: number;
  symbol: string;
  name: string;
  address: string | null;
  checksumAddress: string | null;
  decimals: number;
  riskLevel: RiskLevel;
  maxTradeUsd: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pair extends VerificationFields {
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

export interface RouterConfig extends VerificationFields {
  id: string;
  chainId: number;
  name: string;
  address: string | null;
  checksumAddress: string | null;
  spenderAddress: string | null;
  txTargetAddress: string | null;
  allowanceTargetAddress: string | null;
  functionSelectorAllowlist: Record<string, string[]> | null;
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
  requestId: string | null;
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
  amountInRaw?: string | null;
  amountOutRaw?: string | null;
  amountInUsd?: string | null;
  amountOutUsd?: string | null;
  gasUsed?: string | null;
  gasUsd?: string | null;
  feeNative?: string | null;
  usdPriceSource?: string | null;
  usdPriceTimestamp?: string | null;
  quoteUsdSource?: string | null;
  riskCheckedAt?: string | null;
  aggregateRiskSnapshotJson?: unknown | null;
  errorMessage?: string | null;
  nonce?: number | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  calldataHash?: string | null;
  quoteHash?: string | null;
  simulationHash?: string | null;
  confirmationCount?: number | null;
  finalizedBlock?: string | null;
  replacedByTxHash?: string | null;
  droppedReason?: string | null;
}

export type TransactionRequestStatus =
  | "PENDING"
  | "SUBMITTED"
  | "CONFIRMED"
  | "REJECTED"
  | "FAILED"
  | "CONFLICT";

export interface TransactionRequest {
  id: string;
  idempotencyKey: string;
  walletId: string;
  action: TransactionAction;
  status: TransactionRequestStatus;
  requestHash: string;
  pairId: string | null;
  routerId: string | null;
  sellToken: string | null;
  buyToken: string | null;
  sellAmountRaw: string | null;
  quoteHash: string | null;
  simulationHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PendingWalletLock {
  walletId: string;
  lockedByRequestId: string;
  nonce: number | null;
  status: "ACTIVE" | "RELEASED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletPendingState {
  lock: PendingWalletLock | null;
  request: TransactionRequest | null;
}

export interface TransactionRefreshResult {
  refreshed: boolean;
  reason: string | null;
  transaction: Transaction;
}

export interface NormalizedQuote {
  chainId: number;
  provider: "mock" | "zeroX";
  routerName: string;
  routerAddress: string | null;
  spenderAddress: string | null;
  sellToken: string;
  buyToken: string;
  sellTokenAddress: string | null;
  buyTokenAddress: string | null;
  sellAmountDisplay: string;
  sellAmountRaw: string;
  buyAmountDisplay: string;
  buyAmountRaw: string;
  minBuyAmountRaw: string | null;
  estimatedGas: {
    gasUsed: string;
    gasUsd: string;
    feeNative: string;
  };
  allowanceTarget: string | null;
  txTo: string | null;
  txData: string | null;
  priceImpactBps: number | null;
  slippageBps: number;
  txValue: string;
  quotedAt: string;
  quoteTimestamp: string;
  expiresAt: string;
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
    sellAmountDisplay: string;
    sellAmountRaw: string | null;
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
  lastTestStatus: string | null;
  lastDeliveryAt: string | null;
  recentDeliveries: NotificationDelivery[];
  state: {
    disabled: boolean;
    tokenMissing: boolean;
    chatMissing: boolean;
  };
}

export interface NotificationDelivery {
  id: string;
  channel: string;
  eventType: string;
  status: "SENT" | "FAILED" | "SKIPPED" | string;
  requestId: string | null;
  jobId: string | null;
  walletId: string | null;
  transactionId: string | null;
  destinationPreview: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpsSummary {
  queueDepth: SchedulerStatus["queues"] | null;
  notificationFailuresCount: number;
  submittedTxCount: number;
  failedTxCount: number;
  emergencyPauseStatus: EmergencyPauseStatus;
  vaultStatus: VaultStatus;
  runtimeStatus: RuntimeStatus;
  healthStatus: {
    ok: boolean;
    status: "ok" | "degraded" | string;
    dependencies: Record<
      "database" | "redis" | "rpc",
      {
        status: "ok" | "degraded" | "down" | "skipped" | string;
        detail?: string;
        checkedAt: string;
      }
    >;
  };
}

export interface DashboardSummary {
  apiError: {
    ok: false;
    status: number;
    message: string;
    path: string;
  } | null;
  activeWallets: number;
  pausedWallets: number;
  totalSubmittedTx: number;
  confirmedTx: number;
  failedTx: number;
  dryRunStatus: "Enabled" | "Disabled" | "Unavailable";
  telegramStatus: "Enabled" | "Disabled" | "Unavailable";
  chainStatus: ChainStatus | null;
  schedulerStatus: SchedulerStatus | null;
  aggregateRisk: AggregateRiskStatus | null;
}

export interface AggregateRiskStatus {
  enabled: boolean;
  limits: AggregateLimits | null;
  stats: AggregateStats;
}

export interface AggregateLimits {
  maxDailyTradeUsd: string;
  maxDailyGasUsd: string;
  maxPendingTradeUsd: string;
  maxPendingWallets: number;
  maxFailedTxPerDay: number;
  enabled: boolean;
}

export interface AggregateStats {
  totalTradeUsd: string;
  totalGasUsd: string;
  totalPendingUsd: string;
  activeWalletCount: number;
  failedTxCount: number;
}

export type ScheduleStrategyProfile =
  | "MANUAL_ONLY"
  | "STABLE_ONLY"
  | "LOW_FEE_ONLY"
  | "TOKEN_ROTATION_LIMITED";

export interface WalletGroup {
  id: string;
  name: string;
  description?: string;
  status: "ACTIVE" | "PAUSED" | "QUARANTINED";
  maxDailyTx?: number;
  maxDailyTradeUsd?: string;
  maxDailyGasUsd?: string;
  maxConcurrentWallets?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyProfile {
  id: string;
  name: string;
  description?: string;
  mode: "DRY_RUN_ONLY" | "LIVE_ELIGIBLE_AFTER_GATES";
  maxDailyTx?: number;
  maxHourlyTx?: number;
  minCooldownSeconds?: number;
  maxTradeUsd?: string;
  maxGasUsd?: string;
  maxSlippageBps?: number;
  maxPriceImpactBps?: number;
  allowedHoursJson?: string;
  pairRotationMode: "ROUND_ROBIN" | "WEIGHTED" | "CONSERVATIVE";
  randomizationWindowSeconds?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreflightResult {
  windowStart: string;
  windowEnd: string;
  mode: "DRY_RUN" | "LIVE";
  summary: {
    estimatedTxCount: number;
    estimatedWalletsUsed: number;
    estimatedPairsUsed: number;
    estimatedGasEth: string;
    estimatedGasUsd: string;
    estimatedTradeUsd: string;
    quoteRequestEstimate: number;
  };
  riskUtilization: {
    dailyTradeUsed: string;
    dailyTradeMax: string;
    dailyTradePercent: number;
    dailyGasUsed: string;
    dailyGasMax: string;
    dailyGasPercent: number;
  };
  wallets: Array<{
    walletId: string;
    walletName: string;
    plannedTxCount: number;
    status: "PLANNED" | "SKIPPED";
    reason?: string;
  }>;
  pairs: Array<{
    pairId: string;
    pairLabel: string;
    plannedTxCount: number;
    weight: number;
    skipped: boolean;
    skipReason?: string;
  }>;
  hardBlockers: Array<{ code: string; message: string; entityId?: string }>;
  safetyWarnings: Array<{ code: string; message: string }>;
}

export interface SchedulerStatus {
  started: boolean;
  activeLoop: boolean;
  paused: boolean;
  lockOwner: string | null;
  lockHeartbeatAt: string | null;
  lockExpiresAt: string | null;
  dryRun: boolean;
  liveSchedulerEnabled: boolean;
  schedulerMode: "DRY_RUN_ONLY" | "LIVE_REJECTED" | string;
  emergencyPaused: boolean;
  nextRuns: {
    walletId: string;
    walletName: string;
    scheduleId: string;
    nextRunAt: string | null;
    lastStatus: string | null;
    emergencyPaused: boolean;
  }[];
  failedJobs: {
    id: string;
    walletId: string;
    scheduleId: string | null;
    jobType: string;
    status: string;
    reason: string | null;
    createdAt: string;
    finishedAt: string | null;
  }[];
  pausedWallets: {
    walletId: string;
    walletName: string;
    scheduleId: string;
    emergencyPaused: boolean;
  }[];
  queues: Record<
    "quoteQueue" | "tradeQueue" | "confirmationQueue" | "notificationQueue",
    Record<string, number>
  >;
  dlq?: {
    total: number;
    unresolved: number;
    retryableUnresolved: number;
    byErrorCode: Record<string, number>;
  };
  provider?: {
    circuitState: "CLOSED" | "HALF_OPEN" | "OPEN";
    rateLimit429Count: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    rejectedRequests: number;
    currentConcurrent: number;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
    lastRateLimitedAt: string | null;
  };
}

export interface DeadLetterJobEntry {
  id: string;
  queueName: string;
  jobId: string;
  jobType: string;
  walletId: string | null;
  pairId: string | null;
  scheduleId: string | null;
  requestId: string | null;
  traceId: string | null;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  payloadPreviewJson: Record<string, unknown> | null;
  failedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export interface WalletSchedule {
  id: string | null;
  walletId: string;
  enabled: boolean;
  tradeAmountUsd: string;
  minIntervalMinutes: number;
  maxDailyTrades: number | null;
  maxDailyRuns: number | null;
  strategyProfile: ScheduleStrategyProfile;
  emergencyPaused: boolean;
  failedTxPauseThreshold: number;
  lastScheduledAt: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  failureCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

// ── Trace / Observability Types ─────────────────────────────────────────────

export type TracePhase =
  | "request"
  | "validation"
  | "quote"
  | "risk"
  | "job_queued"
  | "occurrence_status"
  | "tx_created"
  | "tx_status"
  | "notification_status"
  | "alert_status"
  | "dlq"
  | "error";

export interface TraceEvent {
  traceId: string;
  timestamp: string;
  phase: TracePhase;
  entityType: string;
  entityId: string | null;
  status: string;
  message: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface TraceTimeline {
  traceId: string;
  events: TraceEvent[];
  createdAt: string;
}

export type OperatorRole = "viewer" | "operator" | "admin";

export interface MfaSettings {
  mfaEnabled: boolean;
  totpSecretEncrypted: string | null;
  mfaRecoveryCodesHashed: string[] | null;
  mfaEnabledAt: string | null;
}

export interface ReauthStatus {
  reauthenticated: boolean;
  lastReauthAt: number;
}

export interface LoginResponse {
  authenticated: boolean;
  username: string;
  requiresMfa?: boolean;
  tempSessionId?: string;
}

export interface MfaSetupResponse {
  otpauthUri: string;
  qrCodeBase64: string;
  recoveryCodes: string[];
}

export interface ConfirmationState {
  required: boolean;
  requiredPhrase: string | null;
}
