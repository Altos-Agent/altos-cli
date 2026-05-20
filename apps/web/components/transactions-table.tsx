"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  Transaction,
  TransactionAction,
  TransactionStatus
} from "../lib/types";
import { formatDateTime, shortenAddress } from "../lib/format";
import { StatusBadge } from "./ui";
import {
  DemoBasescanBadge,
  isDemoBasescanUrl
} from "./demo-basescan-badge";

const statusFilters = [
  "ALL",
  "DRY_RUN",
  "PLANNED",
  "SUBMITTED",
  "CONFIRMED",
  "FAILED",
  "REJECTED"
] as const;

const actionFilters = [
  "ALL",
  "SWAP",
  "APPROVE",
  "TRANSFER",
  "REVOKE",
  "SIMULATION"
] as const;

type StatusFilter = (typeof statusFilters)[number];
type ActionFilter = (typeof actionFilters)[number];

export const TransactionsTable = ({
  transactions,
  wallets
}: {
  transactions: Transaction[];
  wallets: { id: string; name: string }[];
}) => {
  const [walletId, setWalletId] = useState("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [action, setAction] = useState<ActionFilter>("ALL");

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
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Status pill tabs */}
        <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface p-1">
          {statusFilters.map((value) => (
            <button
              key={value}
              className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                status === value
                  ? "bg-surface-elevated text-ink"
                  : "text-muted hover:text-body"
              }`}
              type="button"
              onClick={() => setStatus(value)}
            >
              {value === "ALL" ? "All" : value.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Action pill tabs */}
        <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface p-1">
          {actionFilters.map((value) => (
            <button
              key={value}
              className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                action === value
                  ? "bg-surface-elevated text-ink"
                  : "text-muted hover:text-body"
              }`}
              type="button"
              onClick={() => setAction(value)}
            >
              {value === "ALL" ? "All" : value}
            </button>
          ))}
        </div>

        {/* Wallet filter */}
        <select
          className="h-8 rounded-md border border-hairline bg-surface-elevated px-2 text-xs text-body"
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

        {/* Count */}
        <span className="text-xs text-stone">
          {filteredTransactions.length} / {transactions.length}
        </span>
      </div>

      {/* Table */}
      {transactions.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-8 text-center">
          <p className="text-sm text-muted">No transactions recorded</p>
          <p className="mt-1 text-xs text-stone">Planned, dry-run, submitted, and confirmed transactions appear here.</p>
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface p-8 text-center">
          <p className="text-sm text-muted">No transactions match this filter</p>
          <p className="mt-1 text-xs text-stone">Try selecting a different status or wallet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-hairline bg-surface">
          <div className="divide-y divide-hairline">
            {filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated transition-colors"
              >
                {/* Status badge */}
                <StatusBadge status={tx.status} />

                {/* Wallet name */}
                <div className="min-w-0 w-28">
                  <p className="text-sm font-medium text-ink truncate">
                    {tx.walletName ?? shortenAddress(tx.walletId, 4)}
                  </p>
                </div>

                {/* Action */}
                <div className="w-20 shrink-0">
                  <span className="rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-muted">
                    {tx.action}
                  </span>
                </div>

                {/* Pair */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-body truncate">{tx.pair ?? "—"}</p>
                  {(tx.amountIn || tx.amountOut) && (
                    <p className="mt-0.5 text-xs text-stone truncate">
                      {tx.amountIn && tx.tokenIn ? `${tx.amountIn} ${tx.tokenIn}` : ""}
                      {tx.amountIn && tx.amountOut ? " → " : ""}
                      {tx.amountOut && tx.tokenOut ? `${tx.amountOut} ${tx.tokenOut}` : ""}
                    </p>
                  )}
                </div>

                {/* Tx hash chip */}
                <div className="shrink-0">
                  {tx.txHash && tx.basescanUrl ? (
                    <div className="flex items-center gap-1.5">
                      <code className="rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] text-stone">
                        {shortenAddress(tx.txHash, 4)}
                      </code>
                      <a
                        className="text-xs text-accent-blue hover:text-accent-blue/80"
                        href={tx.basescanUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        ↗
                      </a>
                      {isDemoBasescanUrl(tx.basescanUrl) && (
                        <DemoBasescanBadge />
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-stone">Pending</span>
                  )}
                </div>

                {/* Created */}
                <div className="w-20 shrink-0 text-right">
                  <p className="text-xs text-stone">
                    {formatDateTime(tx.createdAt).split(" ")[0]}
                  </p>
                  <p className="text-xs text-stone">
                    {formatDateTime(tx.createdAt).split(" ")[1]}
                  </p>
                </div>

                {/* Error indicator */}
                {tx.errorMessage && (
                  <span className="shrink-0" title={tx.errorMessage}>
                    <span className="inline-flex size-1.5 rounded-full bg-accent-red" />
                  </span>
                )}

                {/* Open link */}
                <Link
                  className="shrink-0 text-xs text-muted hover:text-ink"
                  href={`/transactions/${tx.id}`}
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};