"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Wallet, WalletProfile } from "../lib/types";
import { shortenAddress } from "../lib/format";
import { CopyButton } from "./copy-button";
import { EmptyState, StatusBadge } from "./ui";

type WalletFilter = "ALL" | "ACTIVE" | "PAUSED";

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

  const filteredWallets = useMemo(
    () =>
      wallets.filter((wallet) =>
        filter === "ALL" ? true : wallet.status === filter
      ),
    [filter, wallets]
  );
  const selectedCount = selectedIds.length;
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
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["ALL", "ACTIVE", "PAUSED"] as const).map((value) => (
          <button
            key={value}
            className={`rounded-md border px-3 py-2 text-sm ${
              filter === value
                ? "border-blue-400/40 bg-blue-500/15 text-blue-100"
                : "border-slate-700 bg-slate-900 text-slate-400"
            }`}
            type="button"
            onClick={() => setFilter(value)}
          >
            {value[0] + value.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-950/35 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-sm font-medium text-slate-100">
              Bulk actions
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedCount} selected
            </p>
          </div>
          <select
            className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
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
            className="h-9 rounded-md bg-blue-500 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
              className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending || selectedCount === 0}
              type="button"
              onClick={() =>
                void runBulk(() =>
                  api.updateBulkWalletStatus({ walletIds: selectedIds, status })
                )
              }
            >
              {status === "ACTIVE" ? "Resume" : status[0] + status.slice(1).toLowerCase()}
            </button>
          ))}
          <button
            className="h-9 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending || selectedCount === 0}
            type="button"
            onClick={() =>
              void runBulk(async () => {
                const backup = await api.exportEncryptedWalletBackup(selectedIds);
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
              })
            }
          >
            Export encrypted backup
          </button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <textarea
            className="min-h-24 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            placeholder="Paste app-generated encrypted backup JSON"
            value={backupJson}
            onChange={(event) => setBackupJson(event.target.value)}
          />
          <button
            className="h-10 self-start rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending || !backupJson.trim()}
            type="button"
            onClick={() =>
              void runBulk(async () => {
                await api.importEncryptedWalletBackup({
                  backup: JSON.parse(backupJson) as unknown,
                  rotateKeys: true
                });
              })
            }
          >
            Import encrypted backup
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-slate-300">{message}</p>}
      </div>

      {filteredWallets.length === 0 ? (
        <EmptyState
          title="No wallets match this view"
          description="Imported wallets will appear here with status, limits, copy controls, and Basescan links."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-slate-950/60 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Select</th>
                <th className="px-4 py-3">Wallet</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredWallets.map((wallet) => (
                <tr key={wallet.id}>
                  <td className="px-4 py-3">
                    <input
                      checked={selectedIds.includes(wallet.id)}
                      type="checkbox"
                      onChange={() => toggleWallet(wallet.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-slate-100 hover:text-blue-200"
                      href={`/wallets/${wallet.id}`}
                    >
                      {wallet.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={wallet.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="text-slate-300">
                        {shortenAddress(wallet.address)}
                      </code>
                      <CopyButton value={wallet.address} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      className="text-blue-300 hover:text-blue-100"
                      href={`https://basescan.org/address/${wallet.address}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Basescan
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
