"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type {
  ExecuteOnceResult,
  LiveExecutionStatus,
  WalletPairRule
} from "../lib/types";
import { EmptyState, StatusBadge } from "./ui";
import { ConfirmationModal } from "./confirmation-modal";

export const ExecuteOnceCard = ({
  walletId,
  pairRules,
  liveStatus
}: {
  walletId: string;
  pairRules: WalletPairRule[];
  liveStatus: LiveExecutionStatus | null;
}) => {
  const router = useRouter();
  const allowedRules = useMemo(
    () => pairRules.filter(({ pair, rule }) => pair.enabled && rule?.enabled),
    [pairRules]
  );
  const [pairId, setPairId] = useState(allowedRules[0]?.pair.id ?? "");
  const [sellAmountDisplay, setSellAmountDisplay] = useState("");
  const [preferredRouter, setPreferredRouter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<ExecuteOnceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const liveEnabled = liveStatus?.liveExecutionEnabled === true;
  const selectedRule = allowedRules.find(({ pair }) => pair.id === pairId);
  const selectedPairLabel = selectedRule
    ? `${selectedRule.pair.tokenIn?.symbol ?? "Unknown"} / ${
        selectedRule.pair.tokenOut?.symbol ?? "Unknown"
      }`
    : pairId;

  if (allowedRules.length === 0) {
    return (
      <EmptyState
        title="No allowed pairs for execution"
        description="Enable a pair and assign it to this wallet before requesting a one-time live transaction."
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
          ? "Live mode is enabled on the API. A confirmed request can submit a real Base transaction."
          : "DRY_RUN is enabled on the API. Execute-once requests are blocked by default."}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_140px_1fr]">
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
      </div>

      <label className="flex items-start gap-3 rounded-md border border-hairline bg-surface-elevated p-3 text-sm text-body">
        <input
          className="mt-1 size-4 rounded border-hairline bg-surface-elevated"
          checked={confirmed}
          type="checkbox"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          I understand this will send a real Base transaction from this wallet.
        </span>
      </label>

      <button
        className="h-10 rounded-md border border-accent-red/40 bg-accent-red-soft px-4 text-sm font-medium text-accent-red transition hover:bg-accent-red/20 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={
          pending || !liveEnabled || !pairId || !sellAmountDisplay || !confirmed
        }
        type="button"
        onClick={() => setConfirmOpen(true)}
      >
        Execute Once
      </button>

      <ConfirmationModal
        open={confirmOpen}
        title="Confirm execute once"
        description="This is a live-impacting swap request if all API gates are open. It remains blocked in demo or dry-run mode."
        typedConfirmation="EXECUTE"
        confirmLabel="Execute once"
        pending={pending}
        details={[
          { label: "Wallet", value: walletId },
          { label: "Pair", value: selectedPairLabel },
          { label: "Amount", value: sellAmountDisplay },
          {
            label: "Max risk",
            value:
              selectedRule?.rule?.maxTradeUsd ??
              selectedRule?.pair.maxTradeUsd ??
              "No display limit"
          },
          {
            label: "Slippage cap",
            value: selectedRule?.pair.maxSlippageBps
              ? `${selectedRule.pair.maxSlippageBps} bps`
              : "No display limit"
          },
          {
            label: "Router",
            value: preferredRouter.trim() === "" ? "Pair default" : preferredRouter
          },
          {
            label: "API mode",
            value: liveEnabled ? "Live gates may allow send" : "Blocked"
          }
        ]}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setPending(true);
          setError(null);
          setResult(null);
          try {
            const execution = await api.executeOnce({
              walletId,
              pairId,
              sellAmountDisplay,
              preferredRouter:
                preferredRouter.trim() === "" ? null : preferredRouter.trim(),
              confirmLiveExecution: confirmed
            });
            setResult(execution);
            router.refresh();
          } catch (requestError) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Execute-once request failed"
            );
          } finally {
            setPending(false);
            setConfirmOpen(false);
          }
        }}
      />

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
                Execute-once result
              </p>
              <p className="mt-1 text-sm text-muted">
                Transaction record {result.transactionId ?? "not returned"}
              </p>
            </div>
            {result.status ? <StatusBadge status={result.status} /> : null}
          </div>

          {result.txHash && (
            <div className="mt-4 rounded-md border border-accent-green/20 bg-accent-green-soft p-3 text-sm text-accent-green">
              <p className="break-all">Tx hash: {result.txHash}</p>
              {result.basescanUrl && (
                <a
                  className="mt-2 inline-flex text-accent-blue hover:text-accent-blue/80"
                  href={result.basescanUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open in Basescan
                </a>
              )}
            </div>
          )}

          {result.reasons.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-accent-red">
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};