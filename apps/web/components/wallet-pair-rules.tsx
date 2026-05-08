"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "../lib/api";
import type { WalletPairRule } from "../lib/types";
import { EmptyState, StatusBadge } from "./ui";

export const WalletPairRules = ({
  walletId,
  rules
}: {
  walletId: string;
  rules: WalletPairRule[];
}) => {
  const router = useRouter();
  const [drafts, setDrafts] = useState(
    rules.map(({ pair, rule }) => ({
      pairId: pair.id,
      enabled: rule?.enabled ?? false,
      maxTradeUsd: rule?.maxTradeUsd ?? "",
      maxDailyTrades: rule?.maxDailyTrades?.toString() ?? ""
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (rules.length === 0) {
    return (
      <EmptyState
        title="No pairs available"
        description="Enabled pair records are required before assigning wallet pair rules."
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {rules.map(({ pair }, index) => {
          const draft = drafts[index];

          if (!draft) {
            return null;
          }

          return (
            <div
              key={pair.id}
              className="grid gap-3 rounded-lg border border-white/10 bg-slate-950/35 p-4 md:grid-cols-[1fr_120px_120px_90px]"
            >
              <div>
                <p className="font-medium text-slate-100">
                  {pair.tokenIn?.symbol ?? "Unknown"} /{" "}
                  {pair.tokenOut?.symbol ?? "Unknown"}
                </p>
                <div className="mt-2 flex gap-2">
                  <StatusBadge status={pair.enabled ? "ACTIVE" : "PAUSED"} />
                </div>
              </div>
              <input
                className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
                placeholder="Max USD"
                value={draft.maxTradeUsd}
                onChange={(event) => {
                  const next = [...drafts];
                  next[index] = { ...draft, maxTradeUsd: event.target.value };
                  setDrafts(next);
                }}
              />
              <input
                className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
                placeholder="Trades/day"
                value={draft.maxDailyTrades}
                onChange={(event) => {
                  const next = [...drafts];
                  next[index] = {
                    ...draft,
                    maxDailyTrades: event.target.value
                  };
                  setDrafts(next);
                }}
              />
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  checked={draft.enabled}
                  className="h-4 w-4 accent-blue-500"
                  type="checkbox"
                  onChange={(event) => {
                    const next = [...drafts];
                    next[index] = { ...draft, enabled: event.target.checked };
                    setDrafts(next);
                  }}
                />
                Allow
              </label>
            </div>
          );
        })}
      </div>
      <button
        className="h-10 rounded-md bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="button"
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await apiRequest(`/api/wallets/${walletId}/pair-rules`, {
              method: "PUT",
              body: JSON.stringify({
                rules: drafts.map((draft) => ({
                  pairId: draft.pairId,
                  enabled: draft.enabled,
                  maxTradeUsd:
                    draft.maxTradeUsd.trim() === ""
                      ? null
                      : draft.maxTradeUsd.trim(),
                  maxDailyTrades:
                    draft.maxDailyTrades.trim() === ""
                      ? null
                      : Number(draft.maxDailyTrades)
                }))
              })
            });
            router.refresh();
          } catch (requestError) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Pair rule update failed"
            );
          } finally {
            setPending(false);
          }
        }}
      >
        Save pair rules
      </button>
    </div>
  );
};
