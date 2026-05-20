import { notFound } from "next/navigation";
import Link from "next/link";
import { api, isApiError } from "../../../../lib/api";
import {
  formatOptionalUsd,
  formatTokenAmount,
  shortenAddress
} from "../../../../lib/format";
import {
  ErrorState,
  StatusBadge
} from "../../../../components/ui";
import { AllowancesPanel } from "../../../../components/allowances-panel";
import { CopyButton } from "../../../../components/copy-button";
import { DryRunTradeCard } from "../../../../components/dry-run-trade-card";
import { EmergencyPauseButton } from "../../../../components/emergency-pause-button";
import { ExecuteOnceCard } from "../../../../components/execute-once-card";
import { WalletPairRules } from "../../../../components/wallet-pair-rules";
import { WalletScheduleSettings } from "../../../../components/wallet-schedule-settings";
import { WalletStatusActions } from "../../../../components/wallet-status-actions";
import {
  DemoBasescanBadge,
  isDemoBasescanUrl
} from "../../../../components/demo-basescan-badge";

export default async function WalletDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [
    wallet,
    balances,
    basescan,
    transactions,
    pairRules,
    liveStatus,
    allowances,
    schedule
  ] = await Promise.all([
    api.getWallet(id),
    api.getWalletBalances(id),
    api.getWalletBasescan(id),
    api.getTransactions(),
    api.getWalletPairRules(id),
    api.getLiveExecutionStatus(),
    api.getWalletAllowances(id),
    api.getWalletSchedule(id)
  ]);

  if (isApiError(wallet)) {
    return (
      <div className="space-y-5">
        <ErrorState title="Wallet API unavailable" description={wallet.message} />
      </div>
    );
  }

  const walletData = wallet.data;
  if (!walletData) notFound();

  const walletTransactions = isApiError(transactions)
    ? []
    : transactions.data.filter((tx) => tx.walletId === id);
  const pairRulesData = isApiError(pairRules) ? [] : pairRules.data;
  const allowancesData = isApiError(allowances) ? [] : allowances.data;

  return (
    <div className="space-y-5">
      {/* ── Header card ────────────────────────────────────────── */}
      <div className="rounded-xl border border-hairline bg-surface">
        {/* Top accent stripe */}
        <div
          className="h-px w-full"
          style={{
            background: "linear-gradient(90deg, #ff5757 0%, #a1131a 100%)",
          }}
        />
        <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-medium text-ink tracking-tight" style={{ fontFeatureSettings: '"calt", "kern", "liga", "ss03"' }}>
              {walletData.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="text-sm text-body">{shortenAddress(walletData.address, 8)}</code>
              <CopyButton value={walletData.address} />
              {!isApiError(basescan) && (
                <a
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface-elevated px-2 py-1 text-xs text-accent-blue hover:text-accent-blue/80"
                  href={basescan.data.basescanUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Basescan
                  <svg className="size-3" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M3 9l6-6M9 3H3v6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              )}
            </div>
            {walletData.notes && (
              <p className="mt-3 rounded-md border border-hairline bg-surface-elevated px-3 py-2 text-sm text-muted">
                {walletData.notes}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex flex-wrap gap-2">
              <WalletStatusActions wallet={walletData} />
              <EmergencyPauseButton walletId={id} />
            </div>
            <StatusBadge status={walletData.status} />
          </div>
        </div>

        {/* Limits row */}
        <div className="border-t border-hairline px-5 py-3">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span className="text-muted">Max trade </span>
              <span className="font-medium text-body">{formatOptionalUsd(walletData.maxTradeUsd) ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted">Daily trades </span>
              <span className="font-medium text-body">{walletData.maxDailyTrades ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted">Daily loss </span>
              <span className="font-medium text-body">{formatOptionalUsd(walletData.maxDailyLossUsd) ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted">Max gas </span>
              <span className="font-medium text-body">{formatOptionalUsd(walletData.maxGasUsd) ?? "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Balance cards ─────────────────────────────────────── */}
      {!isApiError(balances) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
            <p className="text-xs text-muted">{balances.data.balances.native.symbol} (Native)</p>
            <p className="mt-1.5 text-xl font-medium text-ink">
              {formatTokenAmount(balances.data.balances.native.balanceFormatted)}
            </p>
            <StatusBadge status="ACTIVE" />
          </div>
          {balances.data.balances.tokens.slice(0, 3).map((token) => (
            <div key={token.tokenId} className="rounded-xl border border-hairline bg-surface px-4 py-3">
              <p className="text-xs text-muted">{token.symbol} (ERC20)</p>
              <p className="mt-1.5 text-xl font-medium text-ink">
                {formatTokenAmount(token.balanceFormatted)}
              </p>
              <span className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-[11px] font-medium ${
                token.enabled
                  ? "border-accent-green/30 bg-accent-green-soft text-accent-green"
                  : "border-hairline bg-surface-elevated text-stone"
              }`}>
                {token.enabled ? "Enabled" : token.skippedReason ?? "Disabled"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Section nav tabs ──────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-hairline">
        {["overview", "transactions", "pair-rules", "allowances", "schedule"].map((tab) => (
          <a
            key={tab}
            href={`#${tab}`}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === "overview"
                ? "border-b-2 border-accent-blue text-ink"
                : "text-muted hover:text-body"
            }`}
          >
            {tab === "pair-rules" ? "Pair Rules" : tab === "allowances" ? "Allowances" : tab === "schedule" ? "Schedule" : tab}
          </a>
        ))}
      </div>

      {/* ── Section: Overview ─────────────────────────────────── */}
      <div id="overview" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Dry Run Trade */}
          <div className="rounded-xl border border-hairline bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Dry Run Trade</h2>
              <span className="rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] text-muted">no signing</span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Plan a placeholder swap without decrypting keys, signing, or sending a transaction.
            </p>
            {isApiError(pairRules) ? (
              <ErrorState title="Pair rules unavailable" description={pairRules.message} />
            ) : (
              <div className="mt-4">
                <DryRunTradeCard walletId={walletData.id} pairRules={pairRulesData} />
              </div>
            )}
          </div>

          {/* Execute Once */}
          <div className="rounded-xl border border-hairline bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Execute Once</h2>
            </div>
            <p className="mt-2 text-xs text-muted">
              Submit a single live swap only when the API is explicitly configured for live mode and the request is confirmed.
            </p>
            <div className="mt-4">
              <ExecuteOnceCard
                walletId={walletData.id}
                pairRules={pairRulesData}
                liveStatus={isApiError(liveStatus) ? null : liveStatus.data}
              />
            </div>
          </div>
        </div>

        {/* Schedule Settings */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-ink">Schedule</h2>
          </div>
          <p className="mt-2 text-xs text-muted">
            Configure deterministic wallet scheduling for queue reliability, wallet separation, and rate limiting.
          </p>
          {isApiError(schedule) ? (
            <ErrorState title="Schedule unavailable" description={schedule.message} />
          ) : (
            <div className="mt-4">
              <WalletScheduleSettings walletId={walletData.id} initialSchedule={schedule.data} />
            </div>
          )}
        </div>
      </div>

      {/* ── Section: Pair Rules ──────────────────────────────── */}
      <div id="pair-rules" className="rounded-xl border border-hairline bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Pair Rules</h2>
        </div>
        {isApiError(pairRules) ? (
          <ErrorState title="Pair rules unavailable" description={pairRules.message} />
        ) : (
          <div className="mt-4">
            <WalletPairRules walletId={walletData.id} rules={pairRulesData} />
          </div>
        )}
      </div>

      {/* ── Section: Allowances ──────────────────────────────── */}
      <div id="allowances" className="rounded-xl border border-hairline bg-surface p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Allowances</h2>
        </div>
        <p className="mt-2 text-xs text-muted">
          Review ERC20 allowances by token and router, approve exact amounts, and revoke stale permissions.
        </p>
        {isApiError(allowances) ? (
          <ErrorState title="Allowances unavailable" description={allowances.message} />
        ) : (
          <div className="mt-4">
            <AllowancesPanel
              walletId={walletData.id}
              walletAddress={walletData.address}
              allowances={allowancesData}
              liveStatus={isApiError(liveStatus) ? null : liveStatus.data}
            />
          </div>
        )}
      </div>

      {/* ── Section: Transactions ────────────────────────────── */}
      <div id="transactions" className="rounded-xl border border-hairline bg-surface">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-medium text-ink">Transaction history</h2>
          <span className="text-xs text-stone">{walletTransactions.length} total</span>
        </div>
        <div className="divide-y divide-hairline">
          {isApiError(transactions) ? (
            <div className="px-4 py-8">
              <ErrorState title="Transactions unavailable" description={transactions.message} />
            </div>
          ) : walletTransactions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted">No transactions recorded for this wallet</p>
            </div>
          ) : (
            walletTransactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors">
                <StatusBadge status={tx.status} />
                <span className="min-w-0 flex-1 text-sm text-body truncate">
                  {tx.action} {tx.pair ?? ""}
                </span>
                {tx.errorMessage && (
                  <span className="text-xs text-accent-red truncate">{tx.errorMessage}</span>
                )}
                {tx.txHash && (
                  <>
                    <code className="rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] text-stone">
                      {shortenAddress(tx.txHash, 4)}
                    </code>
                    {tx.basescanUrl && (
                      <a
                        className="shrink-0 text-xs text-accent-blue hover:text-accent-blue/80"
                        href={tx.basescanUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {isDemoBasescanUrl(tx.basescanUrl) ? (
                          <DemoBasescanBadge />
                        ) : (
                          "↗"
                        )}
                      </a>
                    )}
                  </>
                )}
                <Link
                  className="shrink-0 text-xs text-muted hover:text-ink"
                  href={`/transactions/${tx.id}`}
                >
                  Open
                </Link>
              </div>
            ))
          )}
        </div>
        {walletTransactions.length > 8 && (
          <div className="border-t border-hairline px-4 py-3 text-center">
            <Link href="/transactions" className="text-xs text-accent-blue hover:text-accent-blue/80">
              View all {walletTransactions.length} transactions →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}