"use client";

import type { RouterConfig } from "../lib/types";
import { ActionToggle } from "./action-toggle";
import { EmptyState, RiskBadge, VerificationBadge } from "./ui";
import { shortenAddress } from "../lib/format";

const basescanAddressUrl = (address: string | null) =>
  address ? `https://basescan.org/address/${address}` : "Requires verification";

export const RouterManagement = ({ routers }: { routers: RouterConfig[] }) => {
  if (routers.length === 0) {
    return (
      <EmptyState
        title="No routers seeded"
        description="Run the database seed to add 0x, Uniswap Universal Router, and Aerodrome placeholders."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Security header */}
      <div className="flex items-center gap-3 rounded-lg border border-accent-yellow/30 bg-accent-yellow/5 px-4 py-3">
        <span className="inline-flex items-center rounded-xs border border-accent-yellow/40 bg-accent-yellow/15 px-2 py-0.5 text-[11px] font-semibold text-accent-yellow">
          SECURITY
        </span>
        <p className="text-sm text-muted">
          Routers are approved spenders for ERC20 tokens. Enable only verified contracts.
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-b border-hairline pb-3">
        <span className="text-sm font-medium text-ink">{routers.length} routers</span>
        <span className="text-xs text-stone">·</span>
        <span className="text-xs text-muted">
          {routers.filter(r => r.enabled).length} enabled
        </span>
        <span className="text-xs text-stone">·</span>
        <span className="text-xs text-muted">
          {routers.filter(r => r.riskLevel === "HIGH").length} high-risk
        </span>
        <span className="text-xs text-stone">·</span>
        <span className="text-xs text-muted">
          {routers.filter(r => r.verificationStatus === "VERIFIED").length} verified
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-hairline bg-surface">
        <div className="divide-y divide-hairline">
          {routers.map((router) => (
            <div
              key={router.id}
              className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                router.riskLevel === "HIGH"
                  ? "bg-accent-red/5"
                  : "hover:bg-surface-elevated"
              }`}
            >
              {/* Router icon */}
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-elevated text-xs font-medium text-muted">
                R
              </div>

              {/* Name + notes */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{router.name}</span>
                  <RiskBadge level={router.riskLevel as "LOW" | "MEDIUM" | "HIGH"} />
                  <VerificationBadge status={router.verificationStatus} />
                </div>
                {router.notes && (
                  <p className="mt-0.5 text-xs text-stone truncate">{router.notes}</p>
                )}
                <p className="mt-1 truncate text-[11px] text-stone">
                  {router.verificationEvidenceUrl ? (
                    <a
                      className="text-accent-blue hover:text-accent-blue/80"
                      href={router.verificationEvidenceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Evidence: {router.verificationSource ?? "operator record"}
                    </a>
                  ) : (
                    "No router/spender evidence saved"
                  )}
                </p>
              </div>

              {/* Address */}
              <div className="hidden w-40 shrink-0 lg:block">
                <code className="text-xs text-muted">
                  {router.address ? shortenAddress(router.address, 6) : "—"}
                </code>
                {router.address && (
                  <a
                    className="ml-1 text-xs text-accent-blue hover:text-accent-blue/80"
                    href={basescanAddressUrl(router.address)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    ↗
                  </a>
                )}
              </div>

              <div className="hidden w-44 shrink-0 xl:block">
                <p className="truncate text-xs text-muted">
                  spender {router.allowanceTargetAddress ? shortenAddress(router.allowanceTargetAddress, 6) : "defaults to router"}
                </p>
                <p className="mt-0.5 truncate text-xs text-stone">
                  tx.to {router.txTargetAddress ? shortenAddress(router.txTargetAddress, 6) : "defaults to router"}
                </p>
              </div>

              {/* Chain */}
              <div className="hidden w-20 shrink-0 lg:block">
                <span className="rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] text-muted">
                  Base {router.chainId ?? "—"}
                </span>
              </div>

              {/* Toggle */}
              <div className="shrink-0">
                <ActionToggle
                  enabled={router.enabled}
                  label={`Toggle ${router.name}`}
                  enablePath={`/api/routers/${router.id}/enable`}
                  disablePath={`/api/routers/${router.id}/disable`}
                  confirmEnable={{
                    title: `Enable router ${router.name}`,
                    description:
                      "Enabled routers can be selected by pair rules and can become approval spenders. Confirm only after verifying the Base contract address.",
                    typedConfirmation: "ENABLE ROUTER",
                    details: [
                      { label: "Router", value: router.name },
                      { label: "Risk", value: router.riskLevel },
                      { label: "Verification", value: router.verificationStatus },
                      { label: "Address", value: router.address ?? "—" },
                      { label: "Allowance target", value: router.allowanceTargetAddress ?? router.spenderAddress ?? router.address ?? "—" },
                      { label: "Tx target", value: router.txTargetAddress ?? router.address ?? "—" },
                      { label: "Basescan", value: basescanAddressUrl(router.address) },
                      { label: "Notes", value: router.notes ?? "—" }
                    ]
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
