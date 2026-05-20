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
        <div className="rounded-md border border-accent-red/30 bg-accent-red-soft p-3 text-sm text-accent-red">
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
              className="grid gap-3 rounded-lg border border-hairline bg-surface-elevated p-4 md:grid-cols-[1fr_120px_120px_90px]"
            >
              <div>
                <p className="font-medium text-ink">
                  {pair.tokenIn?.symbol ?? "Unknown"} /{" "}
                  {pair.tokenOut?.symbol ?? "Unknown"}
                </p>
                <div className="mt-2 flex gap-2">
                  <StatusBadge status={pair.enabled ? "ACTIVE" : "PAUSED"} />
                </div>
              </div>
              <input
                className="h-10 rounded-md border border-hairline bg-surface px-3 text-sm text-body"
                placeholder="Max USD"
                value={draft.maxTradeUsd}
                onChange={(event) => {
                  const next = [...drafts];
                  next[index] = { ...draft, maxTradeUsd: event.target.value };
                  setDrafts(next);
                }}
              />
              <input
                className="h-10 rounded-md border border-hairline bg-surface px-3 text-sm text-body"
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
              <label className="flex items-center gap-2 text-sm text-body">
                <input
                  checked={draft.enabled}
                  className="h-4 w-4 accent-accent-blue"
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
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
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