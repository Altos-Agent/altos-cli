"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import type { StrategyProfile, WalletSchedule } from "../lib/types";
import { StatusBadge } from "./ui";

const profiles: StrategyProfile[] = [
  "MANUAL_ONLY",
  "STABLE_ONLY",
  "LOW_FEE_ONLY",
  "TOKEN_ROTATION_LIMITED"
];

export const WalletScheduleSettings = ({
  walletId,
  initialSchedule
}: {
  walletId: string;
  initialSchedule: WalletSchedule | null;
}) => {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialSchedule?.enabled ?? false);
  const [tradeAmountUsd, setTradeAmountUsd] = useState(
    initialSchedule?.tradeAmountUsd ?? "1"
  );
  const [minIntervalMinutes, setMinIntervalMinutes] = useState(
    String(initialSchedule?.minIntervalMinutes ?? 60)
  );
  const [maxDailyTrades, setMaxDailyTrades] = useState(
    initialSchedule?.maxDailyTrades?.toString() ?? ""
  );
  const [failedTxPauseThreshold, setFailedTxPauseThreshold] = useState(
    String(initialSchedule?.failedTxPauseThreshold ?? 3)
  );
  const [strategyProfile, setStrategyProfile] = useState<StrategyProfile>(
    initialSchedule?.strategyProfile ?? "MANUAL_ONLY"
  );
  const [emergencyPaused, setEmergencyPaused] = useState(
    initialSchedule?.emergencyPaused ?? false
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={enabled ? "Enabled" : "Disabled"} />
        {emergencyPaused && <StatusBadge status="EMERGENCY_PAUSED" />}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-slate-400">Strategy profile</span>
          <select
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-200"
            value={strategyProfile}
            onChange={(event) =>
              setStrategyProfile(event.target.value as StrategyProfile)
            }
          >
            {profiles.map((profile) => (
              <option key={profile} value={profile}>
                {profile}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-400">Trade amount USD</span>
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-200"
            inputMode="decimal"
            value={tradeAmountUsd}
            onChange={(event) => setTradeAmountUsd(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-400">Min interval minutes</span>
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-200"
            inputMode="numeric"
            value={minIntervalMinutes}
            onChange={(event) => setMinIntervalMinutes(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-400">Max daily trades</span>
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-200"
            inputMode="numeric"
            placeholder="Wallet default"
            value={maxDailyTrades}
            onChange={(event) => setMaxDailyTrades(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-400">Failed tx pause threshold</span>
          <input
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-slate-200"
            inputMode="numeric"
            value={failedTxPauseThreshold}
            onChange={(event) => setFailedTxPauseThreshold(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-300">
        <label className="inline-flex items-center gap-2">
          <input
            checked={enabled}
            type="checkbox"
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Schedule enabled
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={emergencyPaused}
            type="checkbox"
            onChange={(event) => setEmergencyPaused(event.target.checked)}
          />
          Emergency paused
        </label>
      </div>

      <button
        className="h-10 rounded-md bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="button"
        onClick={async () => {
          setPending(true);
          setError(null);
          setSaved(false);
          try {
            await api.updateWalletSchedule(walletId, {
              enabled,
              tradeAmountUsd,
              minIntervalMinutes: Number(minIntervalMinutes),
              maxDailyTrades:
                maxDailyTrades.trim() === "" ? null : Number(maxDailyTrades),
              strategyProfile,
              failedTxPauseThreshold: Number(failedTxPauseThreshold),
              emergencyPaused
            });
            setSaved(true);
            router.refresh();
          } catch (requestError) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Schedule save failed"
            );
          } finally {
            setPending(false);
          }
        }}
      >
        Save Schedule
      </button>

      {saved && <p className="text-sm text-emerald-200">Schedule saved.</p>}
      {error && (
        <p className="rounded-md border border-rose-400/30 bg-rose-400/10 p-2 text-sm text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
};
