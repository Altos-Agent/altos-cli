import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../lib/api";
import {
  formatOptionalUsd,
  formatTokenAmount,
  shortenAddress
} from "../../../../lib/format";
import {
  Card,
  EmptyState,
  PageHeader,
  SecondaryButton,
  StatusBadge
} from "../../../../components/ui";
import { AllowancesPanel } from "../../../../components/allowances-panel";
import { CopyButton } from "../../../../components/copy-button";
import { DryRunTradeCard } from "../../../../components/dry-run-trade-card";
import { EmergencyPauseButton } from "../../../../components/emergency-pause-button";
import { ExecuteOnceCard } from "../../../../components/execute-once-card";
import { WalletPairRules } from "../../../../components/wallet-pair-rules";
import { WalletScheduleSettings } from "../../../../components/wallet-schedule-settings";

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

  if (!wallet) {
    notFound();
  }

  const walletTransactions = transactions.filter((tx) => tx.walletId === id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={wallet.name}
        description="Wallet summary, balances, limits, allowed pairs, and related transaction history."
        action={
          <div className="flex gap-2">
            <SecondaryButton disabled>
              {wallet.status === "ACTIVE" ? "Pause" : "Resume"}
            </SecondaryButton>
            <SecondaryButton disabled>Disable</SecondaryButton>
            <EmergencyPauseButton walletId={id} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-slate-400">Address</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="text-sm text-slate-100">
                  {shortenAddress(wallet.address, 8)}
                </code>
                <CopyButton value={wallet.address} />
                {basescan && (
                  <a
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs text-blue-300 hover:text-blue-100"
                    href={basescan.basescanUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Basescan
                  </a>
                )}
              </div>
            </div>
            <StatusBadge status={wallet.status} />
          </div>
          {wallet.notes && (
            <p className="mt-5 rounded-md bg-slate-950/60 p-3 text-sm text-slate-300">
              {wallet.notes}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium text-slate-200">Limits</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Max trade</dt>
              <dd className="mt-1 text-slate-100">
                {formatOptionalUsd(wallet.maxTradeUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Daily trades</dt>
              <dd className="mt-1 text-slate-100">
                {wallet.maxDailyTrades ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Daily loss</dt>
              <dd className="mt-1 text-slate-100">
                {formatOptionalUsd(wallet.maxDailyLossUsd)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Max gas</dt>
              <dd className="mt-1 text-slate-100">
                {formatOptionalUsd(wallet.maxGasUsd)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-50">Balances</h2>
        {!balances ? (
          <EmptyState
            title="Balances unavailable"
            description="Start the API, database, and Base RPC connection to read wallet balances."
          />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Asset</th>
                  <th className="py-3 pr-4">Type</th>
                  <th className="py-3 pr-4">Balance</th>
                  <th className="py-3 pr-4">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                <tr>
                  <td className="py-3 pr-4 text-slate-100">
                    {balances.balances.native.symbol}
                  </td>
                  <td className="py-3 pr-4 text-slate-400">Native</td>
                  <td className="py-3 pr-4 text-slate-100">
                    {formatTokenAmount(
                      balances.balances.native.balanceFormatted
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status="ACTIVE" />
                  </td>
                </tr>
                {balances.balances.tokens.map((token) => (
                  <tr key={token.tokenId}>
                    <td className="py-3 pr-4 text-slate-100">
                      {token.symbol}
                    </td>
                    <td className="py-3 pr-4 text-slate-400">ERC20</td>
                    <td className="py-3 pr-4 text-slate-100">
                      {formatTokenAmount(token.balanceFormatted)}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">
                      {token.skippedReason ?? (token.enabled ? "Enabled" : "Disabled")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-50">
          Dry Run Trade
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Plan a placeholder swap without decrypting keys, signing, or sending a
          transaction.
        </p>
        <div className="mt-4">
          <DryRunTradeCard walletId={wallet.id} pairRules={pairRules} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-50">
          Schedule Settings
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Configure deterministic wallet scheduling for queue reliability,
          wallet separation, and rate limiting.
        </p>
        <div className="mt-4">
          <WalletScheduleSettings walletId={wallet.id} initialSchedule={schedule} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-50">
          Execute Once
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Submit a single live swap only when the API is explicitly configured
          for live mode and the request is confirmed.
        </p>
        <div className="mt-4">
          <ExecuteOnceCard
            walletId={wallet.id}
            pairRules={pairRules}
            liveStatus={liveStatus}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-50">
          Allowances
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Review ERC20 allowances by token and router, approve exact amounts,
          and revoke stale permissions.
        </p>
        <div className="mt-4">
          <AllowancesPanel
            walletId={wallet.id}
            allowances={allowances}
            liveStatus={liveStatus}
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-50">
            Allowed pairs
          </h2>
          <div className="mt-4">
            <WalletPairRules walletId={wallet.id} rules={pairRules} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-50">
            Transaction history
          </h2>
          <div className="mt-4">
            {walletTransactions.length === 0 ? (
              <EmptyState
                title="No transactions recorded"
                description="Planned, dry-run, submitted, and confirmed transactions will appear here."
              />
            ) : (
              <div className="space-y-3">
                {walletTransactions.slice(0, 5).map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-md border border-white/10 bg-slate-950/35 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-100">
                        {transaction.action} {transaction.pair ?? ""}
                      </span>
                      <StatusBadge status={transaction.status} />
                    </div>
                    {transaction.errorMessage && (
                      <p className="mt-2 text-xs text-rose-200">
                        {transaction.errorMessage}
                      </p>
                    )}
                    {transaction.txHash && transaction.basescanUrl && (
                      <a
                        className="mt-2 inline-flex text-xs text-blue-300 hover:text-blue-100"
                        href={transaction.basescanUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open in Basescan
                      </a>
                    )}
                    <Link
                      className="mt-2 inline-flex text-xs text-blue-300 hover:text-blue-100"
                      href={`/transactions/${transaction.id}`}
                    >
                      Open transaction
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
