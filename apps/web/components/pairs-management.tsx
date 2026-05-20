"use client";

import { useState } from "react";
import type { Pair } from "../lib/types";
import { ActionToggle } from "./action-toggle";
import { EmptyState, RiskBadge, VerificationBadge } from "./ui";

const riskLevels = ["ALL", "LOW", "MEDIUM", "HIGH"] as const;
type RiskFilter = (typeof riskLevels)[number];

export const PairsManagement = ({ pairs }: { pairs: Pair[] }) => {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
  const [showEnabled, setShowEnabled] = useState<boolean | null>(null);

  const getRisk = (pair: Pair) =>
    pair.tokenIn?.riskLevel === "HIGH" || pair.tokenOut?.riskLevel === "HIGH"
      ? "HIGH"
      : pair.tokenIn?.riskLevel === "MEDIUM" || pair.tokenOut?.riskLevel === "MEDIUM"
        ? "MEDIUM"
        : "LOW";

  const filtered = pairs.filter((pair) => {
    if (riskFilter !== "ALL" && getRisk(pair) !== riskFilter) return false;
    if (showEnabled !== null && pair.enabled !== showEnabled) return false;
    return true;
  });

  if (pairs.length === 0) {
    return (
      <EmptyState
        title="No pairs configured"
        description="Create pairs through the API, then enable them after token and router review."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface p-1">
          {riskLevels.map((value) => (
            <button
              key={value}
              className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                riskFilter === value
                  ? "bg-surface-elevated text-ink"
                  : "text-muted hover:text-body"
              }`}
              type="button"
              onClick={() => setRiskFilter(value)}
            >
              {value === "ALL" ? "All risk" : value}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-hairline bg-surface p-1">
          {([[null, "All"], [true, "Enabled"], [false, "Disabled"]] as const).map(
            ([val, label]) => (
              <button
                key={String(val)}
                className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                  showEnabled === val
                    ? "bg-surface-elevated text-ink"
                    : "text-muted hover:text-body"
                }`}
                type="button"
                onClick={() => setShowEnabled(val)}
              >
                {label}
              </button>
            )
          )}
        </div>
        <span className="text-xs text-stone">
          {filtered.length} / {pairs.length}
        </span>
        <span className="text-xs text-stone">·</span>
        <span className="text-xs text-muted">
          {pairs.filter(pair => pair.verificationStatus === "VERIFIED").length} verified pairs
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-hairline bg-surface">
        <div className="divide-y divide-hairline">
          {filtered.map((pair) => {
            const risk = getRisk(pair);
            return (
              <div
                key={pair.id}
                className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                  risk === "HIGH" ? "bg-accent-red/5" : "hover:bg-surface-elevated"
                }`}
              >
                {/* Tokens */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">
                      {pair.tokenIn?.symbol ?? "?"} / {pair.tokenOut?.symbol ?? "?"}
                    </span>
                    <RiskBadge level={risk as "LOW" | "MEDIUM" | "HIGH"} />
                    <VerificationBadge status={pair.verificationStatus} />
                  </div>
                  <p className="mt-0.5 text-xs text-stone">Base {pair.chainId}</p>
                  {(pair.verificationStatus !== "VERIFIED" ||
                    pair.tokenIn?.verificationStatus !== "VERIFIED" ||
                    pair.tokenOut?.verificationStatus !== "VERIFIED") && (
                    <p className="mt-1 text-[11px] text-accent-yellow">
                      Live blocked: pair and both tokens must be VERIFIED with evidence.
                    </p>
                  )}
                </div>

                {/* Limits */}
                <div className="hidden w-32 shrink-0 lg:block">
                  <p className="text-xs text-body">
                    Max {pair.maxTradeUsd ? `$${pair.maxTradeUsd}` : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-stone">
                    Slippage {pair.maxSlippageBps ?? 50} bps
                  </p>
                </div>

                {/* Routers */}
                <div className="hidden w-28 shrink-0 lg:block">
                  <p className="truncate text-xs text-muted">
                    {pair.preferredRouter ?? "—"}
                  </p>
                  {pair.fallbackRouter && (
                    <p className="mt-0.5 truncate text-xs text-stone">
                      ↳ {pair.fallbackRouter}
                    </p>
                  )}
                </div>

                {/* Toggle */}
                <div className="shrink-0">
                  <ActionToggle
                    enabled={pair.enabled}
                    label="Toggle pair"
                    enablePath={`/api/pairs/${pair.id}/enable`}
                    disablePath={`/api/pairs/${pair.id}/disable`}
                    confirmEnable={{
                      title: `Enable ${pair.tokenIn?.symbol ?? "?"} / ${pair.tokenOut?.symbol ?? "?"}`,
                      description:
                        "Enabled pairs can be selected by wallets for dry-run planning and, if all live gates are open, live execution.",
                      typedConfirmation: "ENABLE PAIR",
                      details: [
                        { label: "Pair", value: `${pair.tokenIn?.symbol ?? "?"} / ${pair.tokenOut?.symbol ?? "?"}` },
                        { label: "Risk", value: risk },
                        { label: "Pair verification", value: pair.verificationStatus },
                        { label: "Input token verification", value: pair.tokenIn?.verificationStatus ?? "UNKNOWN" },
                        { label: "Output token verification", value: pair.tokenOut?.verificationStatus ?? "UNKNOWN" },
                        { label: "Max trade", value: pair.maxTradeUsd ?? "Not set" },
                        { label: "Preferred router", value: pair.preferredRouter ?? "Not set" },
                        { label: "Risk note", value: "Token, router, wallet, quote, and amount checks still apply" }
                      ]
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted">No pairs match this filter</p>
          </div>
        )}
      </div>
    </div>
  );
};
