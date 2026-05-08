import type {
  ChainStatus,
  DashboardSummary,
  Transaction,
  TransactionRefreshResult,
  Pair,
  RouterConfig,
  SchedulerStatus,
  StrategyProfile,
  Token,
  Wallet,
  EncryptedWalletBackup,
  WalletBalances,
  WalletBasescan,
  WalletPairRule,
  WalletSchedule,
  WalletProfile,
  ApprovalActionResult,
  DryRunPlanResult,
  ExecuteOnceResult,
  LiveExecutionStatus,
  QuoteResponse,
  TelegramSettings,
  WalletAllowance
} from "./types";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4100";

const safeFetchJson = async <T>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const apiRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
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
  async getChainStatus() {
    return await safeFetchJson<ChainStatus>("/api/chain/status");
  },

  async getWallets() {
    return (await safeFetchJson<Wallet[]>("/api/wallets")) ?? [];
  },

  async getProfiles() {
    return (await safeFetchJson<WalletProfile[]>("/api/profiles")) ?? [];
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
    return await safeFetchJson<Wallet>(`/api/wallets/${id}`);
  },

  async getWalletBalances(id: string) {
    return await safeFetchJson<WalletBalances>(`/api/wallets/${id}/balances`);
  },

  async getWalletBasescan(id: string) {
    return await safeFetchJson<WalletBasescan>(`/api/wallets/${id}/basescan`);
  },

  async getTokens() {
    return (await safeFetchJson<Token[]>("/api/tokens")) ?? [];
  },

  async getPairs() {
    return (await safeFetchJson<Pair[]>("/api/pairs")) ?? [];
  },

  async getRouters() {
    return (await safeFetchJson<RouterConfig[]>("/api/routers")) ?? [];
  },

  async getWalletPairRules(id: string) {
    return (
      (await safeFetchJson<WalletPairRule[]>(
        `/api/wallets/${id}/pair-rules`
      )) ?? []
    );
  },

  async getWalletAllowances(id: string) {
    return (
      (await safeFetchJson<WalletAllowance[]>(
        `/api/wallets/${id}/allowances`
      )) ?? []
    );
  },

  async getTransactions(): Promise<Transaction[]> {
    return (await safeFetchJson<Transaction[]>("/api/transactions")) ?? [];
  },

  async getTransaction(id: string) {
    return await safeFetchJson<Transaction>(`/api/transactions/${id}`);
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
    return await safeFetchJson<TelegramSettings>("/api/settings/telegram");
  },

  async getSchedulerStatus() {
    return await safeFetchJson<SchedulerStatus>("/api/scheduler/status");
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
    return await safeFetchJson<LiveExecutionStatus>("/api/trades/live-status");
  },

  async getWalletSchedule(id: string) {
    return await safeFetchJson<WalletSchedule>(`/api/wallets/${id}/schedule`);
  },

  async updateWalletSchedule(
    id: string,
    input: {
      enabled: boolean;
      tradeAmountUsd: string;
      minIntervalMinutes: number;
      maxDailyTrades: number | null;
      strategyProfile: StrategyProfile;
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
    amountIn: string;
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
    amountIn: string;
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
    amountIn: string;
    preferredRouter?: string | null;
    confirmLiveExecution: boolean;
  }) {
    return await apiRequest<ExecuteOnceResult>("/api/trades/execute-once", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async approveAllowance(input: {
    walletId: string;
    tokenId: string;
    routerId: string;
    amount: string;
    confirmLiveExecution: boolean;
  }) {
    return await apiRequest<ApprovalActionResult>(
      `/api/wallets/${input.walletId}/approve`,
      {
        method: "POST",
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
  }) {
    return await apiRequest<ApprovalActionResult>(
      `/api/wallets/${input.walletId}/revoke`,
      {
        method: "POST",
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
      schedulerStatus
    ] = await Promise.all([
      this.getWallets(),
      this.getTransactions(),
      this.getChainStatus(),
      this.getTelegramSettings(),
      this.getLiveExecutionStatus(),
      this.getSchedulerStatus()
    ]);

    return {
      activeWallets: wallets.filter((wallet) => wallet.status === "ACTIVE")
        .length,
      pausedWallets: wallets.filter((wallet) => wallet.status === "PAUSED")
        .length,
      totalSubmittedTx: transactions.filter(
        (tx) => tx.status === "SUBMITTED"
      ).length,
      confirmedTx: transactions.filter((tx) => tx.status === "CONFIRMED")
        .length,
      failedTx: transactions.filter((tx) => tx.status === "FAILED").length,
      dryRunStatus:
        liveExecutionStatus?.dryRun === false ? "Disabled" : "Enabled",
      telegramStatus: telegramSettings?.enabled ? "Enabled" : "Disabled",
      chainStatus,
      schedulerStatus
    };
  }
};
