import type {
  AggregateRiskStatus,
  AuthMe,
  ApprovalActionResult,
  ChainStatus,
  CsrfResult,
  DashboardSummary,
  DryRunPlanResult,
  EncryptedWalletBackup,
  EmergencyPauseStatus,
  ExecuteOnceResult,
  LiveExecutionStatus,
  LoginResult,
  LoginResponse,
  MfaSetupResponse,
  OpsSummary,
  Pair,
  PreflightResult,
  QuoteResponse,
  ReauthStatus,
  RouterConfig,
  RuntimeStatus,
  ScheduleStrategyProfile,
  SchedulerStatus,
  StrategyProfile,
  TelegramSettings,
  Token,
  Transaction,
  TransactionRefreshResult,
  TransactionRequest,
  VaultStatus,
  Wallet,
  WalletAllowance,
  WalletBalances,
  WalletBasescan,
  WalletGroup,
  WalletPendingState,
  WalletProfile,
  WalletSchedule,
  WalletPairRule,
  TraceTimeline,
} from "./types";

const browserApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4100";
const serverApiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? browserApiBaseUrl;
const apiBaseUrl = () =>
  typeof window === "undefined" ? serverApiBaseUrl : browserApiBaseUrl;

export interface ApiErrorResult {
  ok: false;
  status: number;
  message: string;
  path: string;
}

export interface ApiSuccessResult<T> {
  ok: true;
  data: T;
}

export type ApiReadResult<T> = ApiSuccessResult<T> | ApiErrorResult;

export const isApiError = <T>(
  result: ApiReadResult<T> | T | null
): result is ApiErrorResult =>
  Boolean(
    result &&
      typeof result === "object" &&
      "ok" in result &&
      result.ok === false
  );

const serverCookieHeader = async () => {
  if (typeof window !== "undefined") {
    return {};
  }
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    return cookieHeader ? { cookie: cookieHeader } : {};
  } catch {
    return {};
  }
};

const fetchJsonResult = async <T>(path: string): Promise<ApiReadResult<T>> => {
  try {
    const cookieHeader = await serverCookieHeader();
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      cache: "no-store",
      credentials: "include",
      headers: {
        ...cookieHeader
      }
    });
    const body = (await response.json().catch(() => null)) as
      | T
      | { error?: string }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message:
          body && typeof body === "object" && "error" in body && body.error
            ? body.error
            : `API request failed with ${response.status}`,
        path
      };
    }

    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      status: 0,
      message: "API unavailable",
      path
    };
  }
};

const isUnsafeRequest = (method: string | undefined) =>
  ["POST", "PATCH", "PUT", "DELETE"].includes((method ?? "GET").toUpperCase());

const newIdempotencyKey = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const csrfToken = async () => {
  const cookieHeader = await serverCookieHeader();
  const response = await fetch(`${apiBaseUrl()}/api/auth/csrf`, {
    cache: "no-store",
    credentials: "include",
    headers: {
      ...cookieHeader
    }
  });
  if (!response.ok) {
    throw new Error("Unable to load CSRF token");
  }
  return ((await response.json()) as CsrfResult).csrfToken;
};

export const apiRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const cookieHeader = await serverCookieHeader();
  const csrfHeader =
    isUnsafeRequest(init.method) && path !== "/api/auth/login"
      ? { "x-csrf-token": await csrfToken() }
      : {};
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...cookieHeader,
      ...csrfHeader,
      ...init.headers
    }
  });
  const body = (await response.json().catch(() => null)) as
    | T
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" && "error" in body && body.error
        ? body.error
        : "Request failed"
    );
  }

  return body as T;
};

export interface UpdateTelegramSettingsRequest {
  enabled: boolean;
  botToken?: string | null;
  chatId: string | null;
  notifyOnSubmitted: boolean;
  notifyOnConfirmed: boolean;
  notifyOnFailed: boolean;
  notifyOnRejected: boolean;
  notifyOnDryRun: boolean;
}

export const api = {
  async getAuthMe() {
    return await fetchJsonResult<AuthMe>("/api/auth/me");
  },

  async login(input: { username: string; password: string }) {
    return await apiRequest<LoginResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async logout() {
    return await apiRequest<{ authenticated: false }>("/api/auth/logout", {
      method: "POST"
    });
  },

  async getVaultStatus() {
    return await fetchJsonResult<VaultStatus>("/api/vault/status");
  },

  async unlockVault(input: {
    username?: string;
    password?: string;
    passphrase?: string;
  }) {
    return await apiRequest<VaultStatus>("/api/vault/unlock", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async lockVault() {
    return await apiRequest<VaultStatus>("/api/vault/lock", {
      method: "POST"
    });
  },

  async getEmergencyPause() {
    return await fetchJsonResult<EmergencyPauseStatus>("/api/emergency-pause");
  },

  async getRuntimeStatus() {
    return await fetchJsonResult<RuntimeStatus>("/api/runtime/status");
  },

  async getOpsSummary() {
    return await fetchJsonResult<OpsSummary>("/api/ops/summary");
  },

  async enableEmergencyPause() {
    return await apiRequest<EmergencyPauseStatus>(
      "/api/emergency-pause/enable",
      {
        method: "POST"
      }
    );
  },

  async disableEmergencyPause() {
    return await apiRequest<EmergencyPauseStatus>(
      "/api/emergency-pause/disable",
      {
        method: "POST"
      }
    );
  },

  async getChainStatus() {
    return await fetchJsonResult<ChainStatus>("/api/chain/status");
  },

  async getWallets() {
    return await fetchJsonResult<Wallet[]>("/api/wallets");
  },

  async getProfiles() {
    return await fetchJsonResult<WalletProfile[]>("/api/profiles");
  },

  async importWallet(input: {
    name: string;
    privateKey: string;
    maxTradeUsd?: string | null;
    maxDailyTrades?: number | null;
    maxDailyLossUsd?: string | null;
    maxGasUsd?: string | null;
    notes?: string | null;
  }) {
    return await apiRequest<Wallet>("/api/wallets/import", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async applyProfileToWallets(input: {
    walletIds: string[];
    profileId: WalletProfile["id"];
  }) {
    return await apiRequest<{ count: number; updated: Wallet[] }>(
      "/api/wallets/bulk/apply-profile",
      {
        method: "PATCH",
        body: JSON.stringify(input)
      }
    );
  },

  async updateBulkWalletStatus(input: {
    walletIds: string[];
    status: Wallet["status"];
  }) {
    return await apiRequest<{ count: number; updated: Wallet[] }>(
      "/api/wallets/bulk/status",
      {
        method: "PATCH",
        body: JSON.stringify(input)
      }
    );
  },

  async exportEncryptedWalletBackup(walletIds: string[]) {
    return await apiRequest<EncryptedWalletBackup>(
      "/api/wallets/bulk/export-encrypted",
      {
        method: "POST",
        body: JSON.stringify({ walletIds })
      }
    );
  },

  async importEncryptedWalletBackup(input: {
    backup: unknown;
    rotateKeys?: boolean;
    allowDisabledMismatchImport?: boolean;
  }) {
    return await apiRequest<{
      imported: Wallet[];
      skipped: string[];
      count: number;
      masterKeyMatched: boolean;
    }>("/api/wallets/bulk/import-encrypted", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async getWallet(id: string) {
    return await fetchJsonResult<Wallet>(`/api/wallets/${id}`);
  },

  async getWalletBalances(id: string) {
    return await fetchJsonResult<WalletBalances>(`/api/wallets/${id}/balances`);
  },

  async getWalletBasescan(id: string) {
    return await fetchJsonResult<WalletBasescan>(`/api/wallets/${id}/basescan`);
  },

  async getWalletPending(id: string) {
    return await fetchJsonResult<WalletPendingState>(`/api/wallets/${id}/pending`);
  },

  async getTokens() {
    return await fetchJsonResult<Token[]>("/api/tokens");
  },

  async getPairs() {
    return await fetchJsonResult<Pair[]>("/api/pairs");
  },

  async getRouters() {
    return await fetchJsonResult<RouterConfig[]>("/api/routers");
  },

  async getWalletPairRules(id: string) {
    return await fetchJsonResult<WalletPairRule[]>(
      `/api/wallets/${id}/pair-rules`
    );
  },

  async getWalletAllowances(id: string) {
    return await fetchJsonResult<WalletAllowance[]>(
      `/api/wallets/${id}/allowances`
    );
  },

  async getTransactions() {
    return await fetchJsonResult<Transaction[]>("/api/transactions");
  },

  async getTransactionRequests() {
    return await fetchJsonResult<TransactionRequest[]>("/api/transactions/requests");
  },

  async getTransaction(id: string) {
    return await fetchJsonResult<Transaction>(`/api/transactions/${id}`);
  },

  async refreshTransaction(id: string) {
    return await apiRequest<TransactionRefreshResult>(
      `/api/transactions/${id}/refresh`,
      {
        method: "POST"
      }
    );
  },

  async getTelegramSettings() {
    return await fetchJsonResult<TelegramSettings>("/api/settings/telegram");
  },

  async getSchedulerStatus() {
    return await fetchJsonResult<SchedulerStatus>("/api/scheduler/status");
  },

  async getTraceTimeline(traceId: string) {
    return await fetchJsonResult<TraceTimeline>(`/api/traces/${traceId}`);
  },

  async getTransactionTrace(txId: string) {
    return await fetchJsonResult<TraceTimeline>(`/api/transactions/${txId}/trace`);
  },

  async startScheduler() {
    return await apiRequest<SchedulerStatus>("/api/scheduler/start", {
      method: "POST"
    });
  },

  async stopScheduler() {
    return await apiRequest<SchedulerStatus>("/api/scheduler/stop", {
      method: "POST"
    });
  },

  async pauseScheduler() {
    return await apiRequest<SchedulerStatus>("/api/scheduler/pause", {
      method: "POST"
    });
  },

  async purgeSchedulerQueues() {
    return await apiRequest<SchedulerStatus>("/api/scheduler/purge", {
      method: "POST",
      body: JSON.stringify({ confirm: "PURGE SCHEDULER QUEUES" })
    });
  },

  async updateTelegramSettings(input: UpdateTelegramSettingsRequest) {
    return await apiRequest<TelegramSettings>("/api/settings/telegram", {
      method: "PUT",
      body: JSON.stringify(input)
    });
  },

  async testTelegramSettings() {
    return await apiRequest<{ ok: boolean; sentAt: string }>(
      "/api/settings/telegram/test",
      {
        method: "POST"
      }
    );
  },

  async getLiveExecutionStatus() {
    return await fetchJsonResult<LiveExecutionStatus>("/api/trades/live-status");
  },

  async getWalletSchedule(id: string) {
    return await fetchJsonResult<WalletSchedule>(`/api/wallets/${id}/schedule`);
  },

  async updateWalletSchedule(
    id: string,
    input: {
      enabled: boolean;
      tradeAmountUsd: string;
      minIntervalMinutes: number;
      maxDailyRuns: number | null;
      strategyProfile: ScheduleStrategyProfile;
      failedTxPauseThreshold: number;
      emergencyPaused: boolean;
    }
  ) {
    return await apiRequest<WalletSchedule>(`/api/wallets/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async emergencyPauseWallet(id: string) {
    return await apiRequest<Wallet>(`/api/wallets/${id}/emergency-pause`, {
      method: "POST"
    });
  },

  async createDryRunPlan(input: {
    walletId: string;
    pairId: string;
    sellAmountDisplay: string;
    preferredRouter?: string | null;
    mode: "DRY_RUN_ONLY";
  }) {
    return await apiRequest<DryRunPlanResult>("/api/plans/dry-run", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async createQuote(input: {
    walletId: string;
    pairId: string;
    sellAmountDisplay: string;
    preferredRouter?: string | null;
  }) {
    return await apiRequest<QuoteResponse>("/api/quotes", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async executeOnce(input: {
    walletId: string;
    pairId: string;
    sellAmountDisplay: string;
    preferredRouter?: string | null;
    confirmLiveExecution: boolean;
    idempotencyKey?: string;
  }) {
    return await apiRequest<ExecuteOnceResult>("/api/trades/execute-once", {
      method: "POST",
      headers: {
        "Idempotency-Key": input.idempotencyKey ?? newIdempotencyKey()
      },
      body: JSON.stringify(input)
    });
  },

  async approveAllowance(input: {
    walletId: string;
    tokenId: string;
    routerId: string;
    amount: string;
    confirmLiveExecution: boolean;
    idempotencyKey?: string;
  }) {
    return await apiRequest<ApprovalActionResult>(
      `/api/wallets/${input.walletId}/approve`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": input.idempotencyKey ?? newIdempotencyKey()
        },
        body: JSON.stringify({
          tokenId: input.tokenId,
          routerId: input.routerId,
          amount: input.amount,
          confirmLiveExecution: input.confirmLiveExecution
        })
      }
    );
  },

  async revokeAllowance(input: {
    walletId: string;
    tokenId: string;
    routerId: string;
    confirmLiveExecution: boolean;
    idempotencyKey?: string;
  }) {
    return await apiRequest<ApprovalActionResult>(
      `/api/wallets/${input.walletId}/revoke`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": input.idempotencyKey ?? newIdempotencyKey()
        },
        body: JSON.stringify({
          tokenId: input.tokenId,
          routerId: input.routerId,
          confirmLiveExecution: input.confirmLiveExecution
        })
      }
    );
  },

  async getDashboardSummary(): Promise<DashboardSummary> {
    const [
      wallets,
      transactions,
      chainStatus,
      telegramSettings,
      liveExecutionStatus,
      schedulerStatus,
      aggregateRisk
    ] = await Promise.all([
      this.getWallets(),
      this.getTransactions(),
      this.getChainStatus(),
      this.getTelegramSettings(),
      this.getLiveExecutionStatus(),
      this.getSchedulerStatus(),
      this.getAggregateRisk()
    ]);

    const readError =
      isApiError(wallets)
        ? wallets
        : isApiError(transactions)
          ? transactions
          : isApiError(chainStatus)
            ? chainStatus
            : null;
    const runtimeError = isApiError(liveExecutionStatus)
      ? liveExecutionStatus
      : null;
    const telegramError = isApiError(telegramSettings)
      ? telegramSettings
      : null;
    const schedulerError = isApiError(schedulerStatus) ? schedulerStatus : null;
    const aggregateError = isApiError(aggregateRisk) ? aggregateRisk : null;
    const secondaryError = runtimeError ?? telegramError ?? schedulerError;

    if (readError ?? secondaryError ?? aggregateError) {
      return {
        apiError: readError ?? secondaryError ?? aggregateError,
        activeWallets: 0,
        pausedWallets: 0,
        totalSubmittedTx: 0,
        confirmedTx: 0,
        failedTx: 0,
        dryRunStatus: "Unavailable",
        telegramStatus: "Unavailable",
        chainStatus: null,
        schedulerStatus: null,
        aggregateRisk: null
      };
    }

    const walletRows = wallets.ok ? wallets.data : [];
    const transactionRows = transactions.ok ? transactions.data : [];
    const chainStatusData = chainStatus.ok ? chainStatus.data : null;
    const liveExecutionData = liveExecutionStatus.ok
      ? liveExecutionStatus.data
      : null;
    const telegramData = telegramSettings.ok ? telegramSettings.data : null;
    const schedulerData = schedulerStatus.ok ? schedulerStatus.data : null;

    return {
      apiError: null,
      activeWallets: walletRows.filter((wallet) => wallet.status === "ACTIVE")
        .length,
      pausedWallets: walletRows.filter((wallet) => wallet.status === "PAUSED")
        .length,
      totalSubmittedTx: transactionRows.filter(
        (tx) => tx.status === "SUBMITTED"
      ).length,
      confirmedTx: transactionRows.filter(
        (tx) => tx.status === "CONFIRMED" || tx.status === "FINALIZED"
      ).length,
      failedTx: transactionRows.filter((tx) => tx.status === "FAILED").length,
      dryRunStatus:
        liveExecutionData?.dryRun === false ? "Disabled" : "Enabled",
      telegramStatus: telegramData?.enabled ? "Enabled" : "Disabled",
      chainStatus: chainStatusData,
      schedulerStatus: schedulerData,
      aggregateRisk: aggregateRisk.ok ? aggregateRisk.data : null,
    };
  },

  async getAggregateRisk() {
    return await fetchJsonResult<AggregateRiskStatus>("/api/risk/aggregate");
  },

  // ── Wallet Groups ────────────────────────────────────────────────────────────

  async getWalletGroups() {
    return await fetchJsonResult<WalletGroup[]>("/api/wallet-groups");
  },

  async createWalletGroup(input: {
    name: string;
    description?: string;
    status?: "ACTIVE" | "PAUSED" | "QUARANTINED";
    maxDailyTx?: number | null;
    maxDailyTradeUsd?: string | null;
    maxDailyGasUsd?: string | null;
    maxConcurrentWallets?: number | null;
  }) {
    return await apiRequest<WalletGroup>("/api/wallet-groups", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateWalletGroup(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      status?: "ACTIVE" | "PAUSED" | "QUARANTINED";
      maxDailyTx?: number | null;
      maxDailyTradeUsd?: string | null;
      maxDailyGasUsd?: string | null;
      maxConcurrentWallets?: number | null;
    }
  ) {
    return await apiRequest<WalletGroup>(`/api/wallet-groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteWalletGroup(id: string) {
    return await apiRequest<WalletGroup>(`/api/wallet-groups/${id}`, {
      method: "DELETE",
    });
  },

  // ── Strategy Profiles ───────────────────────────────────────────────────────

  async getStrategyProfiles() {
    return await fetchJsonResult<StrategyProfile[]>("/api/strategy-profiles");
  },

  async createStrategyProfile(input: {
    name: string;
    description?: string;
    mode?: "DRY_RUN_ONLY" | "LIVE_ELIGIBLE_AFTER_GATES";
    maxDailyTx?: number | null;
    maxHourlyTx?: number | null;
    minCooldownSeconds?: number | null;
    maxTradeUsd?: string | null;
    maxGasUsd?: string | null;
    maxSlippageBps?: number | null;
    maxPriceImpactBps?: number | null;
    allowedHoursJson?: string | null;
    pairRotationMode?: "ROUND_ROBIN" | "WEIGHTED" | "CONSERVATIVE";
    randomizationWindowSeconds?: number | null;
    enabled?: boolean;
  }) {
    return await apiRequest<StrategyProfile>("/api/strategy-profiles", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateStrategyProfile(
    id: string,
    input: {
      name?: string;
      description?: string | null;
      mode?: "DRY_RUN_ONLY" | "LIVE_ELIGIBLE_AFTER_GATES";
      maxDailyTx?: number | null;
      maxHourlyTx?: number | null;
      minCooldownSeconds?: number | null;
      maxTradeUsd?: string | null;
      maxGasUsd?: string | null;
      maxSlippageBps?: number | null;
      maxPriceImpactBps?: number | null;
      allowedHoursJson?: string | null;
      pairRotationMode?: "ROUND_ROBIN" | "WEIGHTED" | "CONSERVATIVE";
      randomizationWindowSeconds?: number | null;
      enabled?: boolean;
    }
  ) {
    return await apiRequest<StrategyProfile>(`/api/strategy-profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async deleteStrategyProfile(id: string) {
    return await apiRequest<StrategyProfile>(`/api/strategy-profiles/${id}`, {
      method: "DELETE",
    });
  },

  // ── Pre-flight ───────────────────────────────────────────────────────────────

  async runPreflightSimulation(input: {
    profileId?: string;
    windowHours?: number;
    mode?: "DRY_RUN" | "LIVE";
  }) {
    return await apiRequest<PreflightResult>("/api/scheduler/preflight", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  // ── MFA / Auth ───────────────────────────────────────────────────────────────

  async mfaSetup(): Promise<MfaSetupResponse> {
    return await apiRequest<MfaSetupResponse>("/api/auth/mfa/setup", {
      method: "POST",
    });
  },

  async mfaVerifySetup(totpCode: string): Promise<{ mfaEnabled: boolean }> {
    return await apiRequest<{ mfaEnabled: boolean }>("/api/auth/mfa/verify-setup", {
      method: "POST",
      body: JSON.stringify({ totpCode }),
    });
  },

  async mfaVerify(tempSessionId: string, totpCode: string): Promise<LoginResponse> {
    return await apiRequest<LoginResponse>("/api/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ tempSessionId, totpCode }),
    });
  },

  async mfaDisable(totpCode: string, password: string): Promise<{ mfaEnabled: boolean }> {
    return await apiRequest<{ mfaEnabled: boolean }>("/api/auth/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ totpCode, password }),
    });
  },

  async reauth(password: string): Promise<ReauthStatus> {
    return await apiRequest<ReauthStatus>("/api/auth/reauth", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  }
};

// ── Readiness ─────────────────────────────────────────────────────────────────

export const getReadinessSummary = async (): Promise<ApiReadResult<{
  state: string;
  liveAutomationHardNoGo: boolean;
  liveAutomationReady: boolean;
  blockedChecks: Array<{ id: number; message: string; category: string }>;
  passedCheckIds: number[];
  lastCheckedAt: string | null;
}>> => {
  const res = await fetch(`${apiBaseUrl()}/api/readiness`, { credentials: "include" });
  return res.json();
};

export const runReadinessChecks = async (): Promise<ApiReadResult<{
  state: string;
  checks: Array<{
    id: number;
    category: string;
    name: string;
    status: "PASS" | "FAIL" | "BLOCKED";
    message: string;
    evidence: string | null;
  }>;
  ranAt: string;
}>> => {
  const res = await fetch(`${apiBaseUrl()}/api/readiness/run-checks`, {
    method: "POST",
    credentials: "include",
  });
  return res.json();
};

export const uploadReadinessArtifact = async (input: {
  type: "0x_quote_validation" | "backup_restore_drill" | "emergency_pause_drill" | "dry_run_load_test" | "telegram_test" | "tiny_live_operator_checklist";
  passed: boolean;
  evidence?: string | null;
  notes?: string | null;
}): Promise<ApiReadResult<{ artifactId: string; storedAt: string }>> => {
  const res = await fetch(`${apiBaseUrl()}/api/readiness/artifacts`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return res.json();
};

export const provisionTinyWallet = async (): Promise<ApiReadResult<{
  walletId: string;
  address: string;
  publicLabel: string;
  instructions: string;
}>> => {
  const res = await fetch(`${apiBaseUrl()}/api/readiness/tiny-wallet`, {
    method: "POST",
    credentials: "include",
  });
  return res.json();
};
