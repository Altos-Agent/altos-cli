"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Wallet, WalletProfile } from "../lib/types";
import { shortenAddress } from "../lib/format";
import { CopyButton } from "./copy-button";
import { EmptyState, StatusBadge } from "./ui";
import {
  ConfirmationModal,
  type ConfirmationDetail
} from "./confirmation-modal";

type WalletFilter = "ALL" | "ACTIVE" | "PAUSED";

const walletBasescanUrl = (address: string) =>
  `https://basescan.org/address/${address}`;

export const WalletsTable = ({
  wallets,
  profiles
}: {
  wallets: Wallet[];
  profiles: WalletProfile[];
}) => {
  const [filter, setFilter] = useState<WalletFilter>("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<WalletProfile["id"]>(
    profiles[0]?.id ?? "manual-only"
  );
  const [backupJson, setBackupJson] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    typedConfirmation?: string;
    details: ConfirmationDetail[];
    action: () => Promise<unknown>;
  } | null>(null);

  const filteredWallets = useMemo(
    () =>
      wallets.filter((wallet) =>
        filter === "ALL" ? true : wallet.status === filter
      ),
    [filter, wallets]
  );
  const selectedCount = selectedIds.length;
  const selectedWallets = wallets.filter((wallet) =>
    selectedIds.includes(wallet.id)
  );
  const selectedWalletSummary =
    selectedWallets
      .slice(0, 3)
      .map((wallet) => `${wallet.name} ${shortenAddress(wallet.address)}`)
      .join(", ") || "None";
  const toggleWallet = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selected) => selected !== id)
        : [...current, id]
    );
  const runBulk = async (action: () => Promise<unknown>) => {
    setPending(true);
    setMessage(null);
    try {
      await action();
      setMessage("Bulk action completed.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk action failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {(["ALL", "ACTIVE", "PAUSED"] as const).map((value) => (
          <button
            key={value}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
              filter === value
                ? "border-accent-blue/40 bg-accent-blue-soft text-accent-blue"
                : "border-hairline bg-surface text-muted hover:border-hairline-strong"
            }`}
            type="button"
            onClick={() => setFilter(value)}
          >
            {value[0] + value.slice(1).toLowerCase()}
          </button>
        ))}
        <span className="flex items-center px-2 text-sm text-stone">
          {filteredWallets.length} wallets
        </span>
      </div>

      {/* Bulk actions panel */}
      <div className="rounded-xl border border-hairline bg-surface">
        <div className="border-b border-hairline px-4 py-3">
          <p className="text-sm font-medium text-ink">Bulk actions</p>
          <p className="mt-0.5 text-xs text-muted">
            {selectedCount > 0 ? `${selectedCount} selected` : "None selected"}
          </p>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <select
              className="h-9 rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
              value={profileId}
              onChange={(event) =>
                setProfileId(event.target.value as WalletProfile["id"])
              }
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
            <button
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending || selectedCount === 0}
              type="button"
              onClick={() =>
                void runBulk(() =>
                  api.applyProfileToWallets({ walletIds: selectedIds, profileId })
                )
              }
            >
              Apply profile
            </button>
            {(["PAUSED", "ACTIVE", "DISABLED"] as const).map((status) => (
              <button
                key={status}
                className="inline-flex h-9 items-center justify-center rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending || selectedCount === 0}
                type="button"
                onClick={() => {
                  const action = () =>
                    api.updateBulkWalletStatus({ walletIds: selectedIds, status });
                  if (status === "ACTIVE") {
                    setConfirmation({
                      title: "Activate selected wallets",
                      description:
                        "Active wallets become eligible for dry-run planning and scheduler selection. Review limits before resuming.",
                      confirmLabel: "Activate wallets",
                      typedConfirmation: "ACTIVATE WALLET",
                      details: [
                        { label: "Wallet count", value: String(selectedCount) },
                        { label: "Wallets", value: selectedWalletSummary },
                        {
                          label: "Max risk",
                          value: "Wallet, pair, router, and daily limits still apply"
                        }
                      ],
                      action
                    });
                    return;
                  }
                  void runBulk(action);
                }}
              >
                {status === "ACTIVE" ? "Resume" : status[0] + status.slice(1).toLowerCase()}
              </button>
            ))}
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border border-accent-green/30 bg-accent-green/10 px-3 text-sm font-medium text-accent-green transition hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending || selectedCount === 0}
              type="button"
              onClick={() =>
                setConfirmation({
                  title: "Export encrypted wallet backup",
                  description:
                    "The export contains encrypted private-key payloads. Store it separately from the master key.",
                  confirmLabel: "Export backup",
                  typedConfirmation: "EXPORT BACKUP",
                  details: [
                    { label: "Wallet count", value: String(selectedCount) },
                    { label: "Wallets", value: selectedWalletSummary },
                    { label: "Secret material", value: "Encrypted keys only" }
                  ],
                  action: async () => {
                    const backup =
                      await api.exportEncryptedWalletBackup(selectedIds);
                    const blob = new Blob([JSON.stringify(backup, null, 2)], {
                      type: "application/json"
                    });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `base-orchestrator-wallet-backup-${new Date()
                      .toISOString()
                      .slice(0, 10)}.json`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }
                })
              }
            >
              Export backup
            </button>
          </div>

          {/* Import backup */}
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <textarea
              className="min-h-20 w-full rounded-md border border-hairline bg-surface-elevated px-3 py-2 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none"
              placeholder="Paste app-generated encrypted backup JSON to import"
              value={backupJson}
              onChange={(event) => setBackupJson(event.target.value)}
            />
            <button
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-elevated px-4 text-sm font-medium text-body transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending || !backupJson.trim()}
              type="button"
              onClick={() =>
                setConfirmation({
                  title: "Import encrypted wallet backup",
                  description:
                    "Importing a backup creates wallet records from encrypted private-key payloads. Only use app-generated backups from a trusted source.",
                  confirmLabel: "Import backup",
                  typedConfirmation: "IMPORT BACKUP",
                  details: [
                    { label: "Source", value: "Pasted encrypted backup JSON" },
                    { label: "Rotate keys", value: "Enabled" },
                    {
                      label: "Risk summary",
                      value: "Wallet inventory and encrypted key material can change"
                    }
                  ],
                  action: async () => {
                    await api.importEncryptedWalletBackup({
                      backup: JSON.parse(backupJson) as unknown,
                      rotateKeys: true
                    });
                  }
                })
              }
            >
              Import backup
            </button>
          </div>
          {message && (
            <p className={`mt-3 text-sm ${message.includes("failed") || message.includes("error") ? "text-accent-red" : "text-body"}`}>
              {message}
            </p>
          )}
        </div>
      </div>

      {/* Wallet list — command palette rows */}
      {filteredWallets.length === 0 ? (
        <EmptyState
          title="No wallets match this filter"
          description="Imported wallets will appear here with status, limits, copy controls, and Basescan links."
        />
      ) : (
        <div className="rounded-xl border border-hairline bg-surface">
          <div className="divide-y divide-hairline">
            {filteredWallets.map((wallet) => {
              const selected = selectedIds.includes(wallet.id);
              return (
                <div
                  key={wallet.id}
                  className={`flex items-center gap-4 px-4 py-3 transition-colors ${
                    selected
                      ? "bg-surface-card"
                      : "hover:bg-surface-elevated"
                  }`}
                >
                  {/* Checkbox */}
                  <input
                    className="size-4 rounded border-hairline bg-surface-elevated"
                    checked={selected}
                    type="checkbox"
                    onChange={() => toggleWallet(wallet.id)}
                  />

                  {/* Avatar tile */}
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-elevated text-xs font-medium text-muted">
                    {wallet.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Name + address */}
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block font-medium text-ink hover:text-accent-blue/80"
                      href={`/wallets/${wallet.id}`}
                    >
                      {wallet.name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      <code className="text-xs text-muted">
                        {shortenAddress(wallet.address)}
                      </code>
                      <CopyButton value={wallet.address} />
                    </div>
                  </div>

                  {/* Status */}
                  <StatusBadge status={wallet.status} />

                  {/* Basescan */}
                  <a
                    className="shrink-0 text-xs text-accent-blue hover:text-accent-blue/80"
                    href={walletBasescanUrl(wallet.address)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Basescan
                  </a>

                  {/* Arrow */}
                  <Link
                    href={`/wallets/${wallet.id}`}
                    className="shrink-0 text-muted hover:text-ink"
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmation ? (
        <ConfirmationModal
          open
          title={confirmation.title}
          description={confirmation.description}
          details={confirmation.details}
          confirmLabel={confirmation.confirmLabel}
          typedConfirmation={confirmation.typedConfirmation}
          pending={pending}
          onCancel={() => setConfirmation(null)}
          onConfirm={() =>
            void runBulk(confirmation.action).finally(() =>
              setConfirmation(null)
            )
          }
        />
      ) : null}
    </div>
  );
};