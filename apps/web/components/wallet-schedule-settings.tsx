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
  const [maxDailyRuns, setMaxDailyRuns] = useState(
    (initialSchedule?.maxDailyRuns ?? initialSchedule?.maxDailyTrades)?.toString() ??
      ""
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
          <span className="text-muted">Strategy profile</span>
          <select
            className="h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
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
          <span className="text-muted">Trade amount USD</span>
          <input
            className="h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
            inputMode="decimal"
            value={tradeAmountUsd}
            onChange={(event) => setTradeAmountUsd(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Min interval minutes</span>
          <input
            className="h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
            inputMode="numeric"
            value={minIntervalMinutes}
            onChange={(event) => setMinIntervalMinutes(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Max daily runs</span>
          <input
            className="h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
            inputMode="numeric"
            placeholder="Wallet default"
            value={maxDailyRuns}
            onChange={(event) => setMaxDailyRuns(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted">Failed tx pause threshold</span>
          <input
            className="h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
            inputMode="numeric"
            value={failedTxPauseThreshold}
            onChange={(event) => setFailedTxPauseThreshold(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-body">
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
        className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
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
              maxDailyRuns:
                maxDailyRuns.trim() === "" ? null : Number(maxDailyRuns),
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

      {saved && <p className="text-sm text-accent-green">Schedule saved.</p>}
      {error && (
        <p className="rounded-md border border-accent-red/30 bg-accent-red-soft p-2 text-sm text-accent-red">
          {error}
        </p>
      )}
    </div>
  );
};