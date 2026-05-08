"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import type {
  ApprovalActionResult,
  LiveExecutionStatus,
  WalletAllowance
} from "../lib/types";
import { EmptyState, StatusBadge } from "./ui";

const rowKey = (allowance: WalletAllowance) =>
  `${allowance.token.id}:${allowance.router.id}`;

export const AllowancesPanel = ({
  walletId,
  allowances,
  liveStatus
}: {
  walletId: string;
  allowances: WalletAllowance[];
  liveStatus: LiveExecutionStatus | null;
}) => {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [result, setResult] = useState<ApprovalActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const liveEnabled = liveStatus?.liveExecutionEnabled === true;

  if (allowances.length === 0) {
    return (
      <EmptyState
        title="No allowances to review"
        description="Verified ERC20 tokens and router contracts will appear here once configured."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-md border p-3 text-sm ${
          liveEnabled
            ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
            : "border-slate-700 bg-slate-950/50 text-slate-300"
        }`}
      >
        {liveEnabled
          ? "Approval writes are live transactions. Use exact, small allowances and revoke stale approvals."
          : "DRY_RUN is enabled on the API. Approve and revoke actions are blocked."}
      </div>

      <label className="flex items-start gap-3 rounded-md border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">
        <input
          className="mt-1 size-4 rounded border-slate-600 bg-slate-950"
          checked={confirmed}
          type="checkbox"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          I understand this will send a real Base approval transaction from
          this wallet.
        </span>
      </label>

      {error && (
        <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Approval action recorded</span>
            <StatusBadge status={result.status} />
          </div>
          {result.txHash && result.basescanUrl && (
            <a
              className="mt-2 inline-flex text-blue-300 hover:text-blue-100"
              href={result.basescanUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open in Basescan
            </a>
          )}
          {result.reasons.length > 0 && (
            <p className="mt-2 text-rose-200">{result.reasons.join("; ")}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="py-3 pr-4">Token</th>
              <th className="py-3 pr-4">Router</th>
              <th className="py-3 pr-4">Allowance</th>
              <th className="py-3 pr-4">Risk</th>
              <th className="py-3 pr-4">Approve exact</th>
              <th className="py-3 pr-4">Revoke</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {allowances.map((allowance) => {
              const key = rowKey(allowance);
              const disabled =
                !liveEnabled ||
                !confirmed ||
                Boolean(allowance.skippedReason) ||
                pendingKey !== null;

              return (
                <tr key={key}>
                  <td className="py-3 pr-4 text-slate-100">
                    <div>{allowance.token.symbol}</div>
                    <div className="text-xs text-slate-500">
                      {allowance.token.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-300">
                    <div>{allowance.router.name}</div>
                    <div className="text-xs text-slate-500">
                      {allowance.router.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-100">
                    {allowance.skippedReason ??
                      (allowance.isUnlimited
                        ? "Unlimited"
                        : allowance.allowanceFormatted ?? "0")}
                  </td>
                  <td className="py-3 pr-4">
                    {allowance.isUnlimited ? (
                      <StatusBadge status="UNLIMITED" />
                    ) : allowance.isNonZero ? (
                      <StatusBadge status="NON_ZERO" />
                    ) : (
                      <StatusBadge status="0" />
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex min-w-56 gap-2">
                      <input
                        className="h-9 w-28 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-200"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={amounts[key] ?? ""}
                        onChange={(event) =>
                          setAmounts((current) => ({
                            ...current,
                            [key]: event.target.value
                          }))
                        }
                      />
                      <button
                        className="h-9 rounded-md bg-blue-500 px-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={disabled || !(amounts[key] ?? "").trim()}
                        type="button"
                        onClick={async () => {
                          setPendingKey(key);
                          setError(null);
                          setResult(null);
                          try {
                            const next = await api.approveAllowance({
                              walletId,
                              tokenId: allowance.token.id,
                              routerId: allowance.router.id,
                              amount: amounts[key] ?? "",
                              confirmLiveExecution: confirmed
                            });
                            setResult(next);
                            router.refresh();
                          } catch (requestError) {
                            setError(
                              requestError instanceof Error
                                ? requestError.message
                                : "Approval failed"
                            );
                          } finally {
                            setPendingKey(null);
                          }
                        }}
                      >
                        Approve
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      className="h-9 rounded-md border border-rose-400/30 bg-rose-400/10 px-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={disabled || !allowance.isNonZero}
                      type="button"
                      onClick={async () => {
                        setPendingKey(key);
                        setError(null);
                        setResult(null);
                        try {
                          const next = await api.revokeAllowance({
                            walletId,
                            tokenId: allowance.token.id,
                            routerId: allowance.router.id,
                            confirmLiveExecution: confirmed
                          });
                          setResult(next);
                          router.refresh();
                        } catch (requestError) {
                          setError(
                            requestError instanceof Error
                              ? requestError.message
                              : "Revoke failed"
                          );
                        } finally {
                          setPendingKey(null);
                        }
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
