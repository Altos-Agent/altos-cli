"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import type { SchedulerStatus } from "../lib/types";
import { StatusBadge } from "./ui";

export const SchedulerControls = ({
  initialStatus
}: {
  initialStatus: SchedulerStatus | null;
}) => {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const run = async (action: "start" | "stop") => {
    setPending(true);
    setError(null);
    try {
      const next =
        action === "start" ? await api.startScheduler() : await api.stopScheduler();
      setStatus(next);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Scheduler request failed"
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={status?.started ? "Enabled" : "Disabled"} />
        <StatusBadge status={status?.dryRun === false ? "Live" : "DRY_RUN"} />
      </div>
      <div className="flex gap-2">
        <button
          className="h-9 rounded-md bg-blue-500 px-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || status?.started === true}
          type="button"
          onClick={() => void run("start")}
        >
          Start
        </button>
        <button
          className="h-9 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || status?.started !== true}
          type="button"
          onClick={() => void run("stop")}
        >
          Stop
        </button>
      </div>
      {error && (
        <p className="rounded-md border border-rose-400/30 bg-rose-400/10 p-2 text-sm text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
};
