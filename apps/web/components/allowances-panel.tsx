"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import type {
  ApprovalActionResult,
  LiveExecutionStatus,
  WalletAllowance
} from "../lib/types";
import { EmptyState, StatusBadge } from "./ui";
import {
  ConfirmationModal,
  type ConfirmationDetail
} from "./confirmation-modal";

const rowKey = (allowance: WalletAllowance) =>
  `${allowance.token.id}:${allowance.router.id}`;

const basescanAddressUrl = (address: string | null) =>
  address ? `https://basescan.org/address/${address}` : "Requires verification";

export const AllowancesPanel = ({
  walletId,
  walletAddress,
  allowances,
  liveStatus
}: {
  walletId: string;
  walletAddress: string;
  allowances: WalletAllowance[];
  liveStatus: LiveExecutionStatus | null;
}) => {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    type: "APPROVE" | "REVOKE";
    allowance: WalletAllowance;
    amount: string;
    details: ConfirmationDetail[];
  } | null>(null);
  const [result, setResult] = useState<ApprovalActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const liveEnabled = liveStatus?.liveExecutionEnabled === true;

  const runApproval = async (
    type: "APPROVE" | "REVOKE",
    allowance: WalletAllowance,
    amount: string
  ) => {
    const key = rowKey(allowance);
    setPendingKey(key);
    setError(null);
    setResult(null);
    try {
      const next =
        type === "APPROVE"
          ? await api.approveAllowance({
              walletId,
              tokenId: allowance.token.id,
              routerId: allowance.router.id,
              amount,
              confirmLiveExecution: true
            })
          : await api.revokeAllowance({
              walletId,
              tokenId: allowance.token.id,
              routerId: allowance.router.id,
              confirmLiveExecution: true
            });
      setResult(next);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : `${type === "APPROVE" ? "Approval" : "Revoke"} failed`
      );
    } finally {
      setPendingKey(null);
      setConfirmation(null);
    }
  };

  if (allowances.length === 0) {
    return (
      <EmptyState
        title="No allowances to review"
        description="Verified ERC20 tokens and router contracts will appear here once configured."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`rounded-md border p-3 text-sm ${
          liveEnabled
            ? "border-accent-yellow/30 bg-accent-yellow-soft text-accent-yellow"
            : "border-hairline bg-surface-elevated text-muted"
        }`}
      >
        {liveEnabled
          ? "Approval writes are live transactions. Use exact, small allowances and revoke stale approvals."
          : "DRY_RUN is enabled on the API. Approve and revoke actions are blocked."}
      </div>

      <label className="flex items-start gap-3 rounded-md border border-hairline bg-surface-elevated p-3 text-sm text-body">
        <input
          className="mt-1 size-4 rounded border-hairline bg-surface-elevated"
          checked={confirmed}
          type="checkbox"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          I understand this will send a real Base approval transaction from
          this wallet.
        </span>
      </label>

      {error && (
        <div className="rounded-md border border-accent-red/30 bg-accent-red-soft p-3 text-sm text-accent-red">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-hairline bg-surface-elevated p-3 text-sm text-body">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Approval action recorded</span>
            <StatusBadge status={result.status} />
          </div>
          {result.txHash && result.basescanUrl && (
            <a
              className="mt-2 inline-flex text-accent-blue hover:text-accent-blue/80"
              href={result.basescanUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open in Basescan
            </a>
          )}
          {result.reasons.length > 0 && (
            <p className="mt-2 text-accent-red">{result.reasons.join("; ")}</p>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-hairline text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-3 pr-4">Token</th>
              <th className="py-3 pr-4">Router</th>
              <th className="py-3 pr-4">Allowance</th>
              <th className="py-3 pr-4">Risk</th>
              <th className="py-3 pr-4">Approve exact</th>
              <th className="py-3 pr-4">Revoke</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {allowances.map((allowance) => {
              const key = rowKey(allowance);
              const disabled =
                !liveEnabled ||
                !confirmed ||
                Boolean(allowance.skippedReason) ||
                pendingKey !== null;

              return (
                <tr key={key}>
                  <td className="py-3 pr-4 text-ink">
                    <div>{allowance.token.symbol}</div>
                    <div className="text-xs text-muted">
                      {allowance.token.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-body">
                    <div>{allowance.router.name}</div>
                    <div className="text-xs text-muted">
                      {allowance.router.enabled ? "Enabled" : "Disabled"}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-ink">
                    {allowance.skippedReason ??
                      (allowance.isUnlimited
                        ? "Unlimited"
                        : allowance.allowanceFormatted ?? "0")}
                  </td>
                  <td className="py-3 pr-4">
                    {allowance.isUnlimited ? (
                      <StatusBadge status="UNLIMITED" />
                    ) : allowance.isNonZero ? (
                      <StatusBadge status="NON_ZERO" />
                    ) : (
                      <StatusBadge status="0" />
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex min-w-56 gap-2">
                      <input
                        className="h-9 w-28 rounded-md border border-hairline bg-surface-elevated px-2 text-sm text-body"
                        inputMode="decimal"
                        placeholder="Amount"
                        value={amounts[key] ?? ""}
                        onChange={(event) =>
                          setAmounts((current) => ({
                            ...current,
                            [key]: event.target.value
                          }))
                        }
                      />
                      <button
                        className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={disabled || !(amounts[key] ?? "").trim()}
                        type="button"
                        onClick={() => {
                          const amount = amounts[key] ?? "";
                          setConfirmation({
                            type: "APPROVE",
                            allowance,
                            amount,
                            details: [
                              { label: "Wallet", value: walletAddress },
                              { label: "Token", value: allowance.token.symbol },
                              { label: "Router", value: allowance.router.name },
                              { label: "Router address", value: allowance.router.address },
                              {
                                label: "Router Basescan",
                                value: basescanAddressUrl(allowance.router.address)
                              },
                              { label: "Amount", value: amount },
                              {
                                label: "Current allowance",
                                value:
                                  allowance.allowanceFormatted ??
                                  allowance.allowanceRaw ??
                                  "0"
                              }
                            ]
                          });
                        }}
                      >
                        Approve
                      </button>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <button
                      className="h-9 rounded-md border border-accent-red/30 bg-accent-red-soft px-3 text-sm font-medium text-accent-red transition hover:bg-accent-red/20 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={disabled || !allowance.isNonZero}
                      type="button"
                      onClick={() => {
                        setConfirmation({
                          type: "REVOKE",
                          allowance,
                          amount: "0",
                          details: [
                            { label: "Wallet", value: walletAddress },
                            { label: "Token", value: allowance.token.symbol },
                            { label: "Router", value: allowance.router.name },
                            { label: "Router address", value: allowance.router.address },
                            {
                              label: "Router Basescan",
                              value: basescanAddressUrl(allowance.router.address)
                            },
                            {
                              label: "Allowance removed",
                              value:
                                allowance.allowanceFormatted ??
                                allowance.allowanceRaw ??
                                "0"
                            }
                          ]
                        });
                      }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {confirmation ? (
        <ConfirmationModal
          open
          title={
            confirmation.type === "APPROVE"
              ? "Confirm exact approval"
              : "Confirm allowance revoke"
          }
          description={
            confirmation.type === "APPROVE"
              ? "This is a live-impacting ERC20 approval request when live gates are open. Use exact amounts only."
              : "This sends an approval-to-zero revoke transaction when live gates are open."
          }
          details={confirmation.details}
          typedConfirmation={confirmation.type}
          confirmLabel={
            confirmation.type === "APPROVE" ? "Approve exact" : "Revoke"
          }
          pending={pendingKey !== null}
          onCancel={() => setConfirmation(null)}
          onConfirm={() =>
            void runApproval(
              confirmation.type,
              confirmation.allowance,
              confirmation.amount
            )
          }
        />
      ) : null}
    </div>
  );
};