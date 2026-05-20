"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import { ConfirmationModal } from "./confirmation-modal";

export const GlobalEmergencyPauseButton = ({
  paused,
}: {
  paused: boolean;
}) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const actionLabel = paused ? "Disable global pause" : "Enable global pause";
  const typedConfirmation = paused ? "DISABLE PAUSE" : "ENABLE PAUSE";
  const run = async () => {
    setPending(true);
    setError(null);
    try {
      if (paused) {
        await api.disableEmergencyPause();
      } else {
        await api.enableEmergencyPause();
      }
      router.refresh();
      setConfirmOpen(false);
    } catch (pauseError) {
      setError(
        pauseError instanceof Error
          ? pauseError.message
          : "Emergency pause update failed"
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        className={
          paused
            ? "inline-flex items-center gap-2 rounded-md border border-accent-green/30 bg-accent-green-soft px-4 py-2 text-sm font-medium text-accent-green transition hover:bg-accent-green/20 disabled:opacity-60"
            : "inline-flex items-center gap-2 rounded-md border border-accent-red/40 bg-accent-red-soft px-4 py-2 text-sm font-medium text-accent-red transition hover:bg-accent-red/20 disabled:opacity-60"
        }
        disabled={pending}
        type="button"
        onClick={() => setConfirmOpen(true)}
      >
        {paused ? "Disable global pause" : "Enable global emergency pause"}
      </button>
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <ConfirmationModal
        open={confirmOpen}
        title={actionLabel}
        description={
          paused
            ? "Disabling global emergency pause allows live-impacting controls to proceed if every other live-mode gate is open."
            : "Enabling global emergency pause blocks approvals, revokes, execute-once, and scheduler start."
        }
        typedConfirmation={typedConfirmation}
        confirmLabel={actionLabel}
        pending={pending}
        details={[
          { label: "Current pause", value: paused ? "Enabled" : "Disabled" },
          { label: "Next pause", value: paused ? "Disabled" : "Enabled" },
          {
            label: "Risk summary",
            value: paused
              ? "Live-impacting controls become eligible for their own gates"
              : "Live-impacting controls are blocked globally"
          }
        ]}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void run()}
      />
    </div>
  );
};