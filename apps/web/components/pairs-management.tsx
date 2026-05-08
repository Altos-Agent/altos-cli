"use client";

import type { Pair } from "../lib/types";
import { ActionToggle } from "./action-toggle";
import { EmptyState, StatusBadge } from "./ui";

export const PairsManagement = ({ pairs }: { pairs: Pair[] }) => {
  if (pairs.length === 0) {
    return (
      <EmptyState
        title="No pairs configured"
        description="Create pairs through the API, then enable them after token and router review."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="min-w-full divide-y divide-white/10 text-sm">
        <thead className="bg-slate-950/60 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Pair</th>
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Limits</th>
            <th className="px-4 py-3">Routers</th>
            <th className="px-4 py-3">Enabled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {pairs.map((pair) => {
            const risk =
              pair.tokenIn?.riskLevel === "HIGH" ||
              pair.tokenOut?.riskLevel === "HIGH"
                ? "HIGH"
                : pair.tokenIn?.riskLevel === "MEDIUM" ||
                    pair.tokenOut?.riskLevel === "MEDIUM"
                  ? "MEDIUM"
                  : "LOW";

            return (
              <tr key={pair.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-100">
                    {pair.tokenIn?.symbol ?? "Unknown"} /{" "}
                    {pair.tokenOut?.symbol ?? "Unknown"}
                  </p>
                  <p className="text-xs text-slate-500">Base {pair.chainId}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={risk} />
                </td>
                <td className="px-4 py-3 text-slate-300">
                  <p>Max trade: {pair.maxTradeUsd ?? "Not set"}</p>
                  <p className="text-xs text-slate-500">
                    Slippage {pair.maxSlippageBps ?? 50} bps
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-400">
                  <p>{pair.preferredRouter ?? "No preferred router"}</p>
                  <p className="text-xs text-slate-500">
                    Fallback {pair.fallbackRouter ?? "None"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <ActionToggle
                    enabled={pair.enabled}
                    label="Toggle pair"
                    enablePath={`/api/pairs/${pair.id}/enable`}
                    disablePath={`/api/pairs/${pair.id}/disable`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
