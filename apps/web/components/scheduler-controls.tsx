"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import type { SchedulerStatus } from "../lib/types";
import { StatusBadge } from "./ui";
import { ConfirmationModal } from "./confirmation-modal";
import { QueueHealthPanel } from "./queue-health-panel";

export const SchedulerControls = ({
  initialStatus
}: {
  initialStatus: SchedulerStatus | null;
}) => {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [showQueueHealth, setShowQueueHealth] = useState(false);

  const run = async (action: "start" | "pause" | "stop" | "purge") => {
    setPending(true);
    setError(null);
    try {
      const next =
        action === "start"
          ? await api.startScheduler()
          : action === "pause"
            ? await api.pauseScheduler()
            : action === "purge"
              ? await api.purgeSchedulerQueues()
              : await api.stopScheduler();
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
        <StatusBadge status={status?.activeLoop ? "Active loop" : "Loop idle"} />
        <StatusBadge status={status?.paused ? "Paused" : status?.started ? "Enabled" : "Disabled"} />
        <StatusBadge
          status={
            status?.schedulerMode === "DRY_RUN_ONLY"
              ? "DRY_RUN scheduler"
              : "LIVE rejected"
          }
        />
        {status?.emergencyPaused && <StatusBadge status="EMERGENCY_PAUSED" />}
      </div>
      <div className="grid gap-2 text-xs text-muted">
        <p>Lock owner: {status?.lockOwner ?? "none"}</p>
        <p>
          Next due:{" "}
          {status?.nextRuns?.[0]?.nextRunAt
            ? new Date(status.nextRuns[0].nextRunAt).toLocaleString()
            : "none"}
        </p>
        <p>
          Failed jobs: {status?.failedJobs?.length ?? 0} | Paused wallets:{" "}
          {status?.pausedWallets?.length ?? 0}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || status?.activeLoop === true}
          type="button"
          onClick={() => setConfirmStart(true)}
        >
          Start
        </button>
        <button
          className="h-9 rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || status?.activeLoop !== true}
          type="button"
          onClick={() => void run("pause")}
        >
          Pause
        </button>
        <button
          className="h-9 rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || status?.started !== true}
          type="button"
          onClick={() => void run("stop")}
        >
          Stop
        </button>
        <button
          className="h-9 rounded-md border border-accent-red/40 bg-accent-red-soft px-3 text-sm font-medium text-accent-red transition hover:bg-accent-red/20 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="button"
          onClick={() => setConfirmPurge(true)}
        >
          Purge
        </button>
        <button
          className="h-9 rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body transition hover:border-hairline-strong"
          type="button"
          onClick={() => setShowQueueHealth(!showQueueHealth)}
        >
          {showQueueHealth ? "Hide" : "Show"} Health
        </button>
      </div>
      {showQueueHealth && <QueueHealthPanel status={status} />}
      {error && (
        <p className="rounded-md border border-accent-red/30 bg-accent-red-soft p-2 text-sm text-accent-red">
          {error}
        </p>
      )}
      <ConfirmationModal
        open={confirmStart}
        title="Start scheduler"
        description="Scheduler start creates workers and can enqueue dry-run jobs. Live scheduled execution remains blocked unless explicitly implemented and enabled."
        typedConfirmation="START SCHEDULER"
        confirmLabel="Start scheduler"
        pending={pending}
        details={[
          { label: "Current state", value: status?.started ? "Started" : "Stopped" },
          { label: "Mode", value: status?.schedulerMode ?? "DRY_RUN_ONLY" },
          {
            label: "Live scheduler",
            value: status?.liveSchedulerEnabled ? "Enabled" : "Disabled"
          }
        ]}
        onCancel={() => setConfirmStart(false)}
        onConfirm={() => {
          setConfirmStart(false);
          void run("start");
        }}
      />
      <ConfirmationModal
        open={confirmPurge}
        title="Purge scheduler queues"
        description="This maintenance action drains waiting scheduler queues. It does not delete scheduler job history or transaction records."
        typedConfirmation="PURGE SCHEDULER QUEUES"
        confirmLabel="Purge queues"
        pending={pending}
        details={[
          { label: "Trade waiting", value: String(status?.queues.tradeQueue.waiting ?? 0) },
          { label: "Confirmation waiting", value: String(status?.queues.confirmationQueue.waiting ?? 0) }
        ]}
        onCancel={() => setConfirmPurge(false)}
        onConfirm={() => {
          setConfirmPurge(false);
          void run("purge");
        }}
      />
    </div>
  );
};