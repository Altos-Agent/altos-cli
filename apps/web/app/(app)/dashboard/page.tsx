import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import { api, isApiError } from "../../../lib/api";
import { SchedulerControls } from "../../../components/scheduler-controls";
import { ErrorState, Keycap, StatusBadge } from "../../../components/ui";
import Link from "next/link";

export default async function DashboardPage() {
  const [summary, walletsResult, transactionsResult, vaultResult] = await Promise.all([
    api.getDashboardSummary(),
    api.getWallets(),
    api.getTransactions(),
    api.getVaultStatus()
  ]);
  const wallets = walletsResult.ok ? walletsResult.data : [];
  const transactions = transactionsResult.ok ? transactionsResult.data : [];
  const pendingTransactions = transactions.filter(
    (transaction) => transaction.status === "SUBMITTED"
  );
  const recentRejections = transactions
    .filter((transaction) => transaction.status === "REJECTED")
    .slice(0, 5);
  const nonZeroLimits = wallets.filter(
    (wallet) =>
      wallet.maxTradeUsd ||
      wallet.maxDailyTrades ||
      wallet.maxDailyLossUsd ||
      wallet.maxGasUsd
  );

  const runtimeData = summary.schedulerStatus;
  const vaultStatus = isApiError(vaultResult) ? "UNAVAILABLE" : vaultResult.data.status;

  return (
    <div className="space-y-5">
      {/* ── Hero band ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border border-hairline bg-surface">
        {/* Red stripe at top — used once maximum per page */}
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{
            background: "linear-gradient(90deg, #ff5757 0%, #a1131a 100%)",
          }}
        />
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-medium text-ink tracking-tight" style={{ fontFeatureSettings: '"calt", "kern", "liga", "ss03"' }}>
              Base Orchestrator
            </h1>
            <p className="mt-1 text-sm text-muted">
              Local-first multi-wallet Base automation dashboard
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={summary.dryRunStatus ? "DRY RUN" : "LIVE"} />
            <StatusBadge status={summary.telegramStatus} />
            <StatusBadge status={runtimeData ? (runtimeData.started ? "SCHEDULER RUNNING" : "SCHEDULER IDLE") : "SCHEDULER"} />
            <StatusBadge status={summary.chainStatus?.chainId ? `CHAIN ${summary.chainStatus.chainId}` : `CHAIN ${BASE_CHAIN_ID}`} />
          </div>
        </div>
      </div>

      {/* ── Metrics grid ───────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CommandMetric
          label="Active wallets"
          value={summary.activeWallets}
          badge={summary.activeWallets > 0 ? "ACTIVE" : "NONE"}
        />
        <CommandMetric
          label="Paused wallets"
          value={summary.pausedWallets}
          badge={summary.pausedWallets > 0 ? "PAUSED" : "NONE"}
        />
        <CommandMetric
          label="Submitted tx"
          value={summary.totalSubmittedTx}
        />
        <CommandMetric
          label="Confirmed tx"
          value={summary.confirmedTx}
          accent="green"
        />
        <CommandMetric
          label="Failed tx"
          value={summary.failedTx}
          accent={summary.failedTx > 0 ? "red" : "green"}
        />
        <CommandMetric
          label="Dry-run status"
          value={summary.dryRunStatus}
          badge={summary.dryRunStatus}
        />
        <CommandMetric
          label="Telegram"
          value={summary.telegramStatus}
          badge={summary.telegramStatus}
        />
        <CommandMetric
          label="Chain"
          value={summary.chainStatus?.chainId ?? BASE_CHAIN_ID}
          sub={`Block ${summary.chainStatus?.latestBlockNumber ?? "—"}`}
        />
      </div>

      {/* ── Command center ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        {/* Left: queue + safety */}
        <div className="space-y-4">
          {/* Queue health */}
          <div className="rounded-xl border border-hairline bg-surface">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-medium text-ink">Queue health</h2>
              <span className="text-xs text-muted">real-time</span>
            </div>
            <div className="p-4">
              {runtimeData ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {Object.entries(runtimeData.queues).map(([name, counts]) => (
                    <div
                      key={name}
                      className="rounded-lg border border-hairline bg-surface-elevated px-3 py-2"
                    >
                      <p className="text-xs text-muted">{name}</p>
                      <div className="mt-1.5 flex items-baseline gap-1">
                        <span className="text-xl font-medium text-ink">{counts.waiting ?? 0}</span>
                        <span className="text-xs text-muted">waiting</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                        <span>{counts.active ?? 0} active</span>
                        <span>{counts.failed ?? 0} failed</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Scheduler status unavailable</p>
              )}
            </div>
          </div>

          {/* Safety panel */}
          <div className="rounded-xl border border-hairline bg-surface">
            <div className="flex items-center border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-medium text-ink">System safety</h2>
            </div>
            <div className="divide-y divide-hairline">
              <SafetyRow
                label="Emergency pause"
                value={runtimeData?.emergencyPaused === true ? "ENABLED" : "OFF"}
                accent={runtimeData?.emergencyPaused === true ? "red" : "green"}
              />
              <SafetyRow
                label="Vault"
                value={vaultStatus}
                accent={vaultStatus === "UNLOCKED" ? "green" : "yellow"}
              />
              <SafetyRow
                label="Runtime mode"
                value={summary.dryRunStatus}
                badge
              />
              <SafetyRow
                label="Live execution"
                value={summary.dryRunStatus === "Enabled" ? "BLOCKED" : "READY"}
                accent={summary.dryRunStatus === "Enabled" ? "yellow" : "green"}
              />
            </div>
          </div>
        </div>

        {/* Right: command palette panel */}
        <div className="rounded-xl border border-hairline bg-surface">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <h2 className="text-sm font-medium text-ink">Recent activity</h2>
            <div className="flex items-center gap-1.5">
              <Keycap>⌘</Keycap>
              <Keycap>K</Keycap>
            </div>
          </div>
          <div className="divide-y divide-hairline">
            {recentRejections.length > 0 ? (
              recentRejections.map((tx) => (
                <div key={tx.id} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm text-body truncate">
                      {tx.walletName ?? tx.walletId} · {tx.action}
                    </p>
                    <p className="mt-0.5 text-xs text-accent-red truncate">
                      {tx.errorMessage ?? "Rejected by policy"}
                    </p>
                  </div>
                  <StatusBadge status={tx.status} />
                </div>
              ))
            ) : pendingTransactions.length > 0 ? (
              pendingTransactions.slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm text-body truncate">
                      {tx.walletName ?? tx.walletId} · {tx.action}
                    </p>
                    <p className="mt-0.5 text-xs text-muted truncate">{tx.pair ?? "No pair"}</p>
                  </div>
                  <StatusBadge status={tx.status} />
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted">No recent activity to display</p>
                <p className="mt-1 text-xs text-stone">Submitted and rejected transactions appear here</p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
            <Link href="/transactions" className="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors">
              View all transactions →
            </Link>
            <span className="text-xs text-stone">
              {transactions.length} total
            </span>
          </div>
        </div>
      </div>

      {/* ── Aggregate risk exposure ─────────────────────────────── */}
      {summary.aggregateRisk && summary.aggregateRisk.enabled && (
        <div className="rounded-xl border border-hairline bg-surface px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-ink">Aggregate risk</h2>
              <p className="mt-1 text-xs text-muted">
                Cross-wallet exposure tracking for all active wallets
              </p>
            </div>
            <span className="rounded bg-accent-yellow/10 px-2 py-1 text-xs font-medium text-accent-yellow">
              ACTIVE
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <AggregateRiskMetric
              label="Daily trade cap"
              used={summary.aggregateRisk.stats.totalTradeUsd}
              limit={summary.aggregateRisk.limits?.maxDailyTradeUsd ?? "—"}
            />
            <AggregateRiskMetric
              label="Daily gas cap"
              used={summary.aggregateRisk.stats.totalGasUsd}
              limit={summary.aggregateRisk.limits?.maxDailyGasUsd ?? "—"}
            />
            <AggregateRiskMetric
              label="Pending exposure"
              used={summary.aggregateRisk.stats.totalPendingUsd}
              limit={summary.aggregateRisk.limits?.maxPendingTradeUsd ?? "—"}
            />
            <AggregateRiskMetric
              label="Pending wallets"
              used={String(summary.aggregateRisk.stats.activeWalletCount)}
              limit={summary.aggregateRisk.limits?.maxPendingWallets?.toString() ?? "—"}
            />
            <AggregateRiskMetric
              label="Failed tx today"
              used={String(summary.aggregateRisk.stats.failedTxCount)}
              limit={summary.aggregateRisk.limits?.maxFailedTxPerDay?.toString() ?? "—"}
              accent={
                summary.aggregateRisk.stats.failedTxCount >=
                (summary.aggregateRisk.limits?.maxFailedTxPerDay ?? 999)
                  ? "red"
                  : "green"
              }
            />
          </div>
        </div>
      )}

      {/* ── Risk / approval exposure ───────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Approval exposure</h2>
          <p className="mt-2 text-sm text-muted">
            Full exposure aggregation is pending backend support. Review wallet-level allowance panels for exact spender/token state.
          </p>
          <div className="mt-4 rounded-lg border border-hairline bg-surface-elevated px-4 py-3 text-sm text-body">
            Unlimited approvals remain disabled by default. Exact approvals and revoke-to-zero actions are available per wallet.
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Risk limits</h2>
          {isApiError(walletsResult) ? (
            <ErrorState
              title="Wallet API unavailable"
              description={walletsResult.message}
            />
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-hairline bg-surface-elevated px-4 py-3">
                <p className="text-xs text-muted">Wallets with limits</p>
                <p className="mt-1 text-2xl font-medium text-ink">{nonZeroLimits.length}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-elevated px-4 py-3">
                <p className="text-xs text-muted">Active wallets</p>
                <p className="mt-1 text-2xl font-medium text-ink">{summary.activeWallets}</p>
              </div>
              <p className="sm:col-span-2 text-xs text-muted">
                Pair, router, token, gas, daily trade, slippage, and price-impact checks run server-side per plan.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Scheduler controls ─────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-surface px-5 py-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium text-ink">Scheduler control</h2>
            <p className="mt-1 text-xs text-muted">
              Start or pause the queue worker. Pending transactions remain queued.
            </p>
          </div>
          <SchedulerControls initialStatus={summary.schedulerStatus} />
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function CommandMetric({
  label,
  value,
  badge,
  sub,
  accent
}: {
  label: string;
  value: string | number;
  badge?: string;
  sub?: string;
  accent?: "green" | "red" | "yellow";
}) {
  const accentColors = {
    green: "text-accent-green",
    red: "text-accent-red",
    yellow: "text-accent-yellow",
  };
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className={`text-2xl font-medium ${accent ? accentColors[accent] : "text-ink"}`}>
          {value}
        </span>
        {badge && <StatusBadge status={badge} />}
      </div>
      {sub && <p className="mt-1 text-xs text-stone">{sub}</p>}
    </div>
  );
}

function SafetyRow({
  label,
  value,
  badge,
  accent
}: {
  label: string;
  value: string;
  badge?: boolean;
  accent?: "green" | "red" | "yellow";
}) {
  const accentColors = {
    green: "text-accent-green",
    red: "text-accent-red",
    yellow: "text-accent-yellow",
  };
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted">{label}</span>
      {badge ? (
        <StatusBadge status={value} />
      ) : (
        <span className={`text-sm font-medium ${accent ? accentColors[accent] : "text-body"}`}>
          {value}
        </span>
      )}
    </div>
  );
}

function AggregateRiskMetric({
  label,
  used,
  limit,
  accent
}: {
  label: string;
  used: string;
  limit: string;
  accent?: "green" | "red" | "yellow";
}) {
  const accentColors = {
    green: "text-accent-green",
    red: "text-accent-red",
    yellow: "text-accent-yellow",
  };
  return (
    <div className="rounded-lg border border-hairline bg-surface-elevated px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`text-xl font-medium ${accent ? accentColors[accent] : "text-ink"}`}>
          {used}
        </span>
        <span className="text-xs text-muted">/ {limit}</span>
      </div>
    </div>
  );
}