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
  const [sellAmountDisplay, setSellAmountDisplay] = useState("");
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
          className="h-10 rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
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
          className="h-10 rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
          inputMode="decimal"
          placeholder="Amount USD"
          value={sellAmountDisplay}
          onChange={(event) => setSellAmountDisplay(event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
          placeholder="Router override optional"
          value={preferredRouter}
          onChange={(event) => setPreferredRouter(event.target.value)}
        />
        <button
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || !pairId || !sellAmountDisplay}
          type="button"
          onClick={async () => {
            setPending(true);
            setError(null);
            setResult(null);
            try {
              const plan = await api.createDryRunPlan({
                walletId,
                pairId,
                sellAmountDisplay,
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
        <div className="rounded-md border border-accent-red/30 bg-accent-red-soft p-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-hairline bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                Dry-run result
              </p>
              <p className="mt-1 text-sm text-muted">
                Transaction record {result.transactionId ?? "not returned"}
              </p>
            </div>
            <StatusBadge status={result.status} />
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div>
              <p className="text-muted">Quote provider</p>
              <p className="mt-1 text-ink">
                {result.quote?.provider ?? "Unavailable"}
              </p>
            </div>
            <div>
              <p className="text-muted">Route</p>
              <p className="mt-1 text-ink">
                {result.estimatedRoute.tokenIn ?? "Unknown"} to{" "}
                {result.estimatedRoute.tokenOut ?? "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-muted">Estimated output</p>
              <p className="mt-1 text-ink">
                {result.quote?.buyAmountDisplay ?? "Unavailable"}
              </p>
            </div>
            <div>
              <p className="text-muted">Gas estimate</p>
              <p className="mt-1 text-ink">
                ${result.estimatedGas.gasUsd}
              </p>
            </div>
            <div>
              <p className="text-muted">Total placeholder cost</p>
              <p className="mt-1 text-ink">
                ${result.estimatedCost.estimatedTotalUsd}
              </p>
            </div>
          </div>
          <div className="mt-4">
            {result.quote?.warnings.length ? (
              <div className="mb-3 rounded-md border border-accent-yellow/20 bg-accent-yellow-soft p-3 text-xs text-accent-yellow">
                {result.quote.warnings.join("; ")}
              </div>
            ) : null}
            {result.reasons.length === 0 ? (
              <p className="text-sm text-accent-green">
                Accepted for dry-run. No transaction was sent.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-accent-red">
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