"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Token } from "../lib/types";
import { apiRequest } from "../lib/api";
import { ActionToggle } from "./action-toggle";
import { EmptyState, StatusBadge } from "./ui";

export const TokensManagement = ({ tokens }: { tokens: Token[] }) => {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (tokens.length === 0) {
    return (
      <EmptyState
        title="No tokens found"
        description="Run database migrations and seeds, then refresh this page."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-slate-950/60 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Max trade</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Enabled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {tokens.map((token) => (
              <tr key={token.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-100">{token.symbol}</p>
                  <p className="text-xs text-slate-500">{token.name}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={token.riskLevel} />
                </td>
                <td className="px-4 py-3">
                  <input
                    className="h-9 w-28 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-200"
                    defaultValue={token.maxTradeUsd ?? ""}
                    placeholder="USD"
                    onBlur={async (event) => {
                      const value = event.target.value.trim();
                      if ((token.maxTradeUsd ?? "") === value) {
                        return;
                      }
                      setPendingId(token.id);
                      setError(null);
                      try {
                        await apiRequest(`/api/tokens/${token.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            maxTradeUsd: value === "" ? null : value
                          })
                        });
                        router.refresh();
                      } catch (requestError) {
                        setError(
                          requestError instanceof Error
                            ? requestError.message
                            : "Token update failed"
                        );
                      } finally {
                        setPendingId(null);
                      }
                    }}
                  />
                  {pendingId === token.id && (
                    <p className="mt-1 text-xs text-slate-500">Saving</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {token.address ?? "Requires verification"}
                </td>
                <td className="px-4 py-3">
                  <ActionToggle
                    enabled={token.enabled}
                    label={`Toggle ${token.symbol}`}
                    enablePath={`/api/tokens/${token.id}/enable`}
                    disablePath={`/api/tokens/${token.id}/disable`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
