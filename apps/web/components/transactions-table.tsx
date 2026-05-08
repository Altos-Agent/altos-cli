"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  Transaction,
  TransactionAction,
  TransactionStatus
} from "../lib/types";
import { formatDateTime, shortenAddress } from "../lib/format";
import { EmptyState, StatusBadge } from "./ui";

const statusOptions = [
  "ALL",
  "PLANNED",
  "DRY_RUN",
  "SUBMITTED",
  "CONFIRMED",
  "FAILED",
  "REJECTED"
] as const;

const actionOptions = [
  "ALL",
  "SWAP",
  "APPROVE",
  "TRANSFER",
  "REVOKE",
  "SIMULATION"
] as const;

export const TransactionsTable = ({
  transactions,
  wallets
}: {
  transactions: Transaction[];
  wallets: { id: string; name: string }[];
}) => {
  const [walletId, setWalletId] = useState("ALL");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  const [action, setAction] = useState<(typeof actionOptions)[number]>("ALL");

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        const walletMatch = walletId === "ALL" || tx.walletId === walletId;
        const statusMatch =
          status === "ALL" || tx.status === (status as TransactionStatus);
        const actionMatch =
          action === "ALL" || tx.action === (action as TransactionAction);

        return walletMatch && statusMatch && actionMatch;
      }),
    [action, status, transactions, walletId]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <select
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          value={walletId}
          onChange={(event) => setWalletId(event.target.value)}
        >
          <option value="ALL">All wallets</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as (typeof statusOptions)[number])
          }
        >
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {value === "ALL" ? "All statuses" : value}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          value={action}
          onChange={(event) =>
            setAction(event.target.value as (typeof actionOptions)[number])
          }
        >
          {actionOptions.map((value) => (
            <option key={value} value={value}>
              {value === "ALL" ? "All actions" : value}
            </option>
          ))}
        </select>
      </div>

      {filteredTransactions.length === 0 ? (
        <EmptyState
          title="No transactions found"
          description="Transaction rows will appear after planning and dry-run workflows are connected."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-slate-950/60 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pair</th>
                <th className="px-4 py-3">Tx hash</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-4 py-3 text-slate-100">
                    {tx.walletName ?? tx.walletId}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{tx.action}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tx.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {tx.pair ?? "None"}
                  </td>
                  <td className="px-4 py-3">
                    {tx.txHash && tx.basescanUrl ? (
                      <a
                        className="text-blue-300 hover:text-blue-100"
                        href={tx.basescanUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {shortenAddress(tx.txHash)}
                      </a>
                    ) : (
                      <span className="text-slate-500">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {formatDateTime(tx.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="text-blue-300 hover:text-blue-100"
                      href={`/transactions/${tx.id}`}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
