"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import type { Wallet } from "../lib/types";
import { ConfirmationModal } from "./confirmation-modal";

const walletBasescanUrl = (address: string) =>
  `https://basescan.org/address/${address}`;

export const WalletStatusActions = ({ wallet }: { wallet: Wallet }) => {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<Wallet["status"] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!nextStatus) return;
    setPending(true);
    setError(null);
    try {
      await api.updateBulkWalletStatus({
        walletIds: [wallet.id],
        status: nextStatus
      });
      router.refresh();
      setNextStatus(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Wallet status update failed"
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="h-9 rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body disabled:opacity-60"
        disabled={wallet.status === "ACTIVE"}
        type="button"
        onClick={() => setNextStatus("ACTIVE")}
      >
        Resume
      </button>
      <button
        className="h-9 rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body disabled:opacity-60"
        disabled={wallet.status === "PAUSED"}
        type="button"
        onClick={() => setNextStatus("PAUSED")}
      >
        Pause
      </button>
      <button
        className="h-9 rounded-md border border-accent-red/30 bg-accent-red-soft px-3 text-sm font-medium text-accent-red disabled:opacity-60"
        disabled={wallet.status === "DISABLED"}
        type="button"
        onClick={() => setNextStatus("DISABLED")}
      >
        Disable
      </button>
      {error && <p className="w-full text-sm text-accent-red">{error}</p>}
      {nextStatus ? (
        <ConfirmationModal
          open
          title={`${nextStatus === "ACTIVE" ? "Activate" : "Update"} wallet`}
          description="Wallet status changes affect eligibility for planning, scheduling, and operator workflows."
          confirmLabel="Update wallet"
          typedConfirmation={
            nextStatus === "ACTIVE" ? "ACTIVATE WALLET" : undefined
          }
          pending={pending}
          details={[
            { label: "Wallet", value: wallet.name },
            { label: "Address", value: wallet.address },
            { label: "Basescan", value: walletBasescanUrl(wallet.address) },
            { label: "Current status", value: wallet.status },
            { label: "Next status", value: nextStatus },
            { label: "Max trade", value: wallet.maxTradeUsd ?? "Not set" },
            {
              label: "Max daily trades",
              value: wallet.maxDailyTrades?.toString() ?? "Not set"
            },
            { label: "Max gas", value: wallet.maxGasUsd ?? "Not set" }
          ]}
          onCancel={() => setNextStatus(null)}
          onConfirm={() => void run()}
        />
      ) : null}
    </div>
  );
};