import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "../../../../lib/api";
import { formatDateTime, shortenAddress } from "../../../../lib/format";
import { Card, PageHeader, StatusBadge } from "../../../../components/ui";
import { RefreshTransactionButton } from "../../../../components/refresh-transaction-button";

export default async function TransactionDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transaction = await api.getTransaction(id);

  if (!transaction) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transaction"
        description="Receipt status, wallet context, route metadata, and explorer links."
        action={<RefreshTransactionButton transactionId={transaction.id} />}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-400">Status</p>
            <div className="mt-2">
              <StatusBadge status={transaction.status} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Action</p>
            <p className="mt-2 text-lg font-semibold text-slate-50">
              {transaction.action}
            </p>
          </div>
        </div>

        {transaction.errorMessage && (
          <div className="mt-5 rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
            {transaction.errorMessage}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-50">Links</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Wallet</dt>
              <dd className="mt-1">
                <Link
                  className="text-blue-300 hover:text-blue-100"
                  href={`/wallets/${transaction.walletId}`}
                >
                  {transaction.walletName ?? transaction.walletId}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Pair</dt>
              <dd className="mt-1 text-slate-100">
                {transaction.pairId ? (
                  <Link
                    className="text-blue-300 hover:text-blue-100"
                    href="/pairs"
                  >
                    {transaction.pair ?? transaction.pairId}
                  </Link>
                ) : (
                  transaction.pair ?? "None"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Basescan</dt>
              <dd className="mt-1">
                {transaction.txHash && transaction.basescanUrl ? (
                  <a
                    className="text-blue-300 hover:text-blue-100"
                    href={transaction.basescanUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {shortenAddress(transaction.txHash)}
                  </a>
                ) : (
                  <span className="text-slate-500">No transaction hash</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-50">Receipt</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Gas used</dt>
              <dd className="mt-1 text-slate-100">
                {transaction.gasUsed ?? "Pending"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Gas USD</dt>
              <dd className="mt-1 text-slate-100">
                {transaction.gasUsd ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd className="mt-1 text-slate-100">
                {formatDateTime(transaction.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Updated</dt>
              <dd className="mt-1 text-slate-100">
                {formatDateTime(transaction.updatedAt)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
