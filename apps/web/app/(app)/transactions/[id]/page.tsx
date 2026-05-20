import Link from "next/link";
import { notFound } from "next/navigation";
import { api, isApiError } from "../../../../lib/api";
import { formatDateTime, shortenAddress } from "../../../../lib/format";
import { ErrorState, StatusBadge } from "../../../../components/ui";
import { RefreshTransactionButton } from "../../../../components/refresh-transaction-button";
import { DemoBasescanBadge } from "../../../../components/demo-basescan-badge";

export default async function TransactionDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transaction = await api.getTransaction(id);

  if (isApiError(transaction)) {
    return (
      <div className="space-y-5">
        <ErrorState title="Transaction API unavailable" description={transaction.message} />
      </div>
    );
  }

  const tx = transaction.data;
  if (!tx) notFound();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium text-ink tracking-tight" style={{ fontFeatureSettings: '"calt", "kern", "liga", "ss03"' }}>
            Transaction
          </h1>
          <p className="mt-1 text-sm text-muted">
            {tx.action} · {tx.pair ?? "No pair"}
          </p>
        </div>
        <RefreshTransactionButton transactionId={tx.id} />
      </div>

      {/* Status + error */}
      <div className="rounded-xl border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs text-muted">Status</p>
            <div className="mt-1.5">
              <StatusBadge status={tx.status} />
            </div>
          </div>
          {tx.confirmationCount !== null && tx.confirmationCount !== undefined && (
            <div>
              <p className="text-xs text-muted">Confirmations</p>
              <p className="mt-1.5 text-sm font-medium text-body">{tx.confirmationCount}</p>
            </div>
          )}
          {tx.finalizedBlock && (
            <div>
              <p className="text-xs text-muted">Finalized block</p>
              <p className="mt-1.5 text-sm font-medium text-body">{tx.finalizedBlock}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted">Created</p>
            <p className="mt-1.5 text-sm text-body">{formatDateTime(tx.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Updated</p>
            <p className="mt-1.5 text-sm text-body">{formatDateTime(tx.updatedAt)}</p>
          </div>
        </div>
        {tx.errorMessage && (
          <div className="mt-4 rounded-md border border-accent-red/30 bg-accent-red/10 p-3 text-sm text-accent-red">
            {tx.errorMessage}
          </div>
        )}
        {tx.droppedReason && (
          <div className="mt-4 rounded-md border border-accent-yellow/30 bg-accent-yellow/10 p-3 text-sm text-accent-yellow">
            Dropped: {tx.droppedReason}
          </div>
        )}
      </div>

      {/* Grid: Wallet + Route + Receipt + Hash */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Wallet */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Wallet</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Name</span>
              <Link className="text-sm text-accent-blue hover:text-accent-blue/80" href={`/wallets/${tx.walletId}`}>
                {tx.walletName ?? shortenAddress(tx.walletId, 6)}
              </Link>
            </div>
            {tx.walletAddress && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Address</span>
                <code className="text-xs text-body">{shortenAddress(tx.walletAddress, 8)}</code>
              </div>
            )}
            {tx.fromAddress && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">From</span>
                <code className="text-xs text-body">{shortenAddress(tx.fromAddress, 8)}</code>
              </div>
            )}
            {tx.toAddress && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">To</span>
                <code className="text-xs text-body">{shortenAddress(tx.toAddress, 8)}</code>
              </div>
            )}
            {tx.nonce !== null && tx.nonce !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Nonce</span>
                <span className="text-xs text-body">{tx.nonce}</span>
              </div>
            )}
          </div>
        </div>

        {/* Route / Pair */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Route & Amount</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Pair</span>
              <span className="text-sm text-body">{tx.pair ?? "—"}</span>
            </div>
            {tx.tokenIn && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Token in</span>
                <span className="text-sm text-body">{tx.tokenIn}</span>
              </div>
            )}
            {tx.amountIn && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Amount in raw</span>
                <span className="text-sm text-body">{tx.amountIn}</span>
              </div>
            )}
            {tx.amountInUsd && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Amount in USD</span>
                <span className="text-sm text-body">${tx.amountInUsd}</span>
              </div>
            )}
            {tx.tokenOut && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Token out</span>
                <span className="text-sm text-body">{tx.tokenOut}</span>
              </div>
            )}
            {tx.amountOut && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Amount out raw</span>
                <span className="text-sm text-body">{tx.amountOut}</span>
              </div>
            )}
            {tx.amountOutUsd && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Amount out USD</span>
                <span className="text-sm text-body">${tx.amountOutUsd}</span>
              </div>
            )}
            {tx.riskCheckedAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Aggregate risk checked</span>
                <span className="text-sm text-body">
                  {new Date(tx.riskCheckedAt).toLocaleString()}
                </span>
              </div>
            )}
            {tx.router && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Router</span>
                <code className="text-xs text-body">{shortenAddress(tx.router, 6)}</code>
              </div>
            )}
          </div>
        </div>

        {/* Gas / Receipt */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Gas & Receipt</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Gas used</span>
              <span className="text-sm text-body">{tx.gasUsed ?? "Pending"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Gas USD</span>
              <span className="text-sm text-body">{tx.gasUsd ?? "Unknown"}</span>
            </div>
            {tx.feeNative && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Fee (Native)</span>
                <span className="text-sm text-body">{tx.feeNative}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tx hash + Basescan */}
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Explorer</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">Tx hash</span>
              {tx.txHash ? (
                <div className="flex items-center gap-2">
                  <code className="rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] text-body">
                    {shortenAddress(tx.txHash, 6)}
                  </code>
                  {tx.basescanUrl && (
                    <a
                      className="text-xs text-accent-blue hover:text-accent-blue/80"
                      href={tx.basescanUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      ↗ Basescan
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-xs text-stone">Pending</span>
              )}
            </div>
            {tx.basescanUrl && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Demo</span>
                <DemoBasescanBadge />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Idempotency / Request info */}
      {(tx.requestId || tx.quoteHash || tx.calldataHash || tx.simulationHash) && (
        <div className="rounded-xl border border-hairline bg-surface p-5">
          <h2 className="text-sm font-medium text-ink">Request & Idempotency</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {tx.requestId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Request ID</span>
                <code className="text-[11px] text-body">{tx.requestId}</code>
              </div>
            )}
            {tx.quoteHash && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Quote hash</span>
                <code className="text-[11px] text-body">{shortenAddress(tx.quoteHash, 6)}</code>
              </div>
            )}
            {tx.calldataHash && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Calldata hash</span>
                <code className="text-[11px] text-body">{shortenAddress(tx.calldataHash, 6)}</code>
              </div>
            )}
            {tx.simulationHash && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Simulation hash</span>
                <code className="text-[11px] text-body">{shortenAddress(tx.simulationHash, 6)}</code>
              </div>
            )}
            {tx.replacedByTxHash && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Replaced by</span>
                <code className="text-[11px] text-body">{shortenAddress(tx.replacedByTxHash, 6)}</code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
