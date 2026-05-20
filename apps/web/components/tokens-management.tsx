"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Token } from "../lib/types";
import { apiRequest } from "../lib/api";
import { ActionToggle } from "./action-toggle";
import { EmptyState, RiskBadge, VerificationBadge } from "./ui";
import { shortenAddress } from "../lib/format";

const basescanTokenUrl = (address: string | null) =>
  address ? `https://basescan.org/token/${address}` : "Requires verification";

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
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-accent-red/30 bg-accent-red-soft p-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      {/* Column header */}
      <div className="flex items-center gap-4 border-b border-hairline pb-3">
        <span className="text-sm font-medium text-ink">{tokens.length} tokens</span>
        <span className="text-xs text-stone">·</span>
        <span className="text-xs text-muted">
          {tokens.filter(t => t.enabled).length} enabled
        </span>
        <span className="text-xs text-stone">·</span>
        <span className="text-xs text-muted">
          {tokens.filter(t => t.riskLevel === "HIGH").length} high-risk
        </span>
        <span className="text-xs text-stone">·</span>
        <span className="text-xs text-muted">
          {tokens.filter(t => t.verificationStatus === "VERIFIED").length} verified
        </span>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-hairline bg-surface">
        <div className="divide-y divide-hairline">
          {tokens.map((token) => (
            <div
              key={token.id}
              className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                token.riskLevel === "HIGH"
                  ? "bg-accent-red/5"
                  : "hover:bg-surface-elevated"
              }`}
            >
              {/* Token icon tile */}
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-elevated text-xs font-medium text-muted">
                {token.symbol.charAt(0)}
              </div>

              {/* Symbol + name */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{token.symbol}</span>
                  <RiskBadge level={token.riskLevel as "LOW" | "MEDIUM" | "HIGH"} />
                  <VerificationBadge status={token.verificationStatus} />
                </div>
                <p className="mt-0.5 text-xs text-muted truncate">{token.name}</p>
                <p className="mt-1 truncate text-[11px] text-stone">
                  {token.verificationEvidenceUrl ? (
                    <a
                      className="text-accent-blue hover:text-accent-blue/80"
                      href={token.verificationEvidenceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Evidence: {token.verificationSource ?? "operator record"}
                    </a>
                  ) : (
                    "No verification evidence saved"
                  )}
                </p>
              </div>

              {/* Address */}
              <div className="hidden w-36 shrink-0 lg:block">
                <code className="text-xs text-stone">
                  {token.address ? shortenAddress(token.address, 6) : "—"}
                </code>
                {token.address && (
                  <a
                    className="ml-1 text-xs text-accent-blue hover:text-accent-blue/80"
                    href={basescanTokenUrl(token.address)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    ↗
                  </a>
                )}
              </div>

              {/* Max trade input */}
              <div className="w-32 shrink-0">
                <input
                  className="h-8 w-full rounded-md border border-hairline bg-surface-elevated px-2 text-xs text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none"
                  defaultValue={token.maxTradeUsd ?? ""}
                  placeholder="No limit"
                  onBlur={async (event) => {
                    const value = event.target.value.trim();
                    if ((token.maxTradeUsd ?? "") === value) return;
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
                  <p className="mt-1 text-[10px] text-muted">Saving…</p>
                )}
              </div>

              {/* Toggle */}
              <div className="shrink-0">
                <ActionToggle
                  enabled={token.enabled}
                  label={`Toggle ${token.symbol}`}
                  enablePath={`/api/tokens/${token.id}/enable`}
                  disablePath={`/api/tokens/${token.id}/disable`}
                  {...(token.riskLevel === "HIGH"
                    ? {
                        confirmEnable: {
                          title: `Enable high-risk token ${token.symbol}`,
                          description:
                            "This makes the token eligible for configured pairs. Verify address, decimals, and max trade limits before enabling.",
                          typedConfirmation: "ENABLE TOKEN",
                          details: [
                            { label: "Token", value: token.symbol },
                            { label: "Risk", value: token.riskLevel },
                            { label: "Verification", value: token.verificationStatus },
                            { label: "Address", value: token.address ?? "—" },
                            { label: "Basescan", value: basescanTokenUrl(token.address) },
                            {
                              label: "Max trade",
                              value: token.maxTradeUsd ? `$${token.maxTradeUsd}` : "No limit"
                            }
                          ]
                        }
                      }
                    : {})}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
