"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type {
  ExecuteOnceResult,
  LiveExecutionStatus,
  WalletPairRule
} from "../lib/types";
import { EmptyState, StatusBadge } from "./ui";

export const ExecuteOnceCard = ({
  walletId,
  pairRules,
  liveStatus
}: {
  walletId: string;
  pairRules: WalletPairRule[];
  liveStatus: LiveExecutionStatus | null;
}) => {
  const router = useRouter();
  const allowedRules = useMemo(
    () => pairRules.filter(({ pair, rule }) => pair.enabled && rule?.enabled),
    [pairRules]
  );
  const [pairId, setPairId] = useState(allowedRules[0]?.pair.id ?? "");
  const [amountIn, setAmountIn] = useState("");
  const [preferredRouter, setPreferredRouter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ExecuteOnceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const liveEnabled = liveStatus?.liveExecutionEnabled === true;

  if (allowedRules.length === 0) {
    return (
      <EmptyState
        title="No allowed pairs for execution"
        description="Enable a pair and assign it to this wallet before requesting a one-time live transaction."
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
          ? "Live mode is enabled on the API. A confirmed request can submit a real Base transaction."
          : "DRY_RUN is enabled on the API. Execute-once requests are blocked by default."}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr]">
        <select
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          value={pairId}
          onChange={(event) => setPairId(event.target.value)}
        >
          {allowedRules.map(({ pair }) => (
            <option key={pair.id} value={pair.id}>
              {pair.tokenIn?.symbol ?? "Unknown"} /{" "}
              {pair.tokenOut?.symbol ?? "Unknown"}
            </option>
          ))}
        </select>
        <input
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          inputMode="decimal"
          placeholder="Amount USD"
          value={amountIn}
          onChange={(event) => setAmountIn(event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          placeholder="Router override optional"
          value={preferredRouter}
          onChange={(event) => setPreferredRouter(event.target.value)}
        />
      </div>

      <label className="flex items-start gap-3 rounded-md border border-white/10 bg-slate-950/35 p-3 text-sm text-slate-300">
        <input
          className="mt-1 size-4 rounded border-slate-600 bg-slate-950"
          checked={confirmed}
          type="checkbox"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          I understand this will send a real Base transaction from this wallet.
        </span>
      </label>

      <button
        className="h-10 rounded-md bg-rose-500 px-4 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending || !liveEnabled || !pairId || !amountIn || !confirmed}
        type="button"
        onClick={async () => {
          setPending(true);
          setError(null);
          setResult(null);
          try {
            const execution = await api.executeOnce({
              walletId,
              pairId,
              amountIn,
              preferredRouter:
                preferredRouter.trim() === "" ? null : preferredRouter.trim(),
              confirmLiveExecution: confirmed
            });
            setResult(execution);
            router.refresh();
          } catch (requestError) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Execute-once request failed"
            );
          } finally {
            setPending(false);
          }
        }}
      >
        Execute Once
      </button>

      {error && (
        <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-white/10 bg-slate-950/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Execute-once result
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Transaction record {result.transactionId ?? "not returned"}
              </p>
            </div>
            {result.status ? <StatusBadge status={result.status} /> : null}
          </div>

          {result.txHash && (
            <div className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
              <p className="break-all">Tx hash: {result.txHash}</p>
              {result.basescanUrl && (
                <a
                  className="mt-2 inline-flex text-blue-200 hover:text-blue-100"
                  href={result.basescanUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open in Basescan
                </a>
              )}
            </div>
          )}

          {result.reasons.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-rose-200">
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
