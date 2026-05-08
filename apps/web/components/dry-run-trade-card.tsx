"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { DryRunPlanResult, WalletPairRule } from "../lib/types";
import { EmptyState, StatusBadge } from "./ui";

export const DryRunTradeCard = ({
  walletId,
  pairRules
}: {
  walletId: string;
  pairRules: WalletPairRule[];
}) => {
  const router = useRouter();
  const allowedRules = useMemo(
    () => pairRules.filter(({ pair, rule }) => pair.enabled && rule?.enabled),
    [pairRules]
  );
  const [pairId, setPairId] = useState(allowedRules[0]?.pair.id ?? "");
  const [amountIn, setAmountIn] = useState("");
  const [preferredRouter, setPreferredRouter] = useState("");
  const [result, setResult] = useState<DryRunPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (allowedRules.length === 0) {
    return (
      <EmptyState
        title="No allowed pairs for dry-run"
        description="Enable a pair and assign it to this wallet before planning a dry-run trade."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto]">
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
        <button
          className="h-10 rounded-md bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || !pairId || !amountIn}
          type="button"
          onClick={async () => {
            setPending(true);
            setError(null);
            setResult(null);
            try {
              const plan = await api.createDryRunPlan({
                walletId,
                pairId,
                amountIn,
                preferredRouter:
                  preferredRouter.trim() === ""
                    ? null
                    : preferredRouter.trim(),
                mode: "DRY_RUN_ONLY"
              });
              setResult(plan);
              router.refresh();
            } catch (requestError) {
              setError(
                requestError instanceof Error
                  ? requestError.message
                  : "Dry-run failed"
              );
            } finally {
              setPending(false);
            }
          }}
        >
          Run
        </button>
      </div>

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
                Dry-run result
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Transaction record {result.transactionId ?? "not returned"}
              </p>
            </div>
            <StatusBadge status={result.status} />
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div>
              <p className="text-slate-500">Quote provider</p>
              <p className="mt-1 text-slate-100">
                {result.quote?.provider ?? "Unavailable"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Route</p>
              <p className="mt-1 text-slate-100">
                {result.estimatedRoute.tokenIn ?? "Unknown"} to{" "}
                {result.estimatedRoute.tokenOut ?? "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Estimated output</p>
              <p className="mt-1 text-slate-100">
                {result.quote?.buyAmount ?? "Unavailable"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Gas estimate</p>
              <p className="mt-1 text-slate-100">
                ${result.estimatedGas.gasUsd}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Total placeholder cost</p>
              <p className="mt-1 text-slate-100">
                ${result.estimatedCost.estimatedTotalUsd}
              </p>
            </div>
          </div>
          <div className="mt-4">
            {result.quote?.warnings.length ? (
              <div className="mb-3 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                {result.quote.warnings.join("; ")}
              </div>
            ) : null}
            {result.reasons.length === 0 ? (
              <p className="text-sm text-emerald-200">
                Accepted for dry-run. No transaction was sent.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-rose-200">
                {result.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
