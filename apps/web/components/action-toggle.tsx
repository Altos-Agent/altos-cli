"use client";

import { useState } from "react";
import {
  ConfirmationModal,
  type ConfirmationDetail
} from "./confirmation-modal";

export const ActionToggle = ({
  enabled,
  enablePath,
  disablePath,
  label,
  confirmEnable,
  confirmDisable
}: {
  enabled: boolean;
  enablePath: string;
  disablePath: string;
  label: string;
  confirmEnable?: {
    title: string;
    description: string;
    details: ConfirmationDetail[];
    typedConfirmation?: string | undefined;
  };
  confirmDisable?: {
    title: string;
    description: string;
    details: ConfirmationDetail[];
    typedConfirmation?: string | undefined;
  };
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"enable" | "disable" | null>(
    null
  );

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      const { apiRequest } = await import("../lib/api");
      await apiRequest(enabled ? disablePath : enablePath, {
        method: "POST"
      });
      window.location.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Update failed"
      );
    } finally {
      setPending(false);
      setConfirming(null);
    }
  };

  const currentConfirmation = confirming
    ? confirming === "enable"
      ? confirmEnable
      : confirmDisable
    : null;

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        aria-label={label}
        className={`relative h-6 w-11 rounded-full border transition ${
          enabled
            ? "border-accent-green/40 bg-accent-green/30"
            : "border-hairline bg-surface-elevated"
        } ${pending ? "opacity-60" : ""}`}
        disabled={pending}
        type="button"
        onClick={() => {
          const nextAction = enabled ? "disable" : "enable";
          const confirmation =
            nextAction === "enable" ? confirmEnable : confirmDisable;
          if (confirmation) {
            setConfirming(nextAction);
            return;
          }
          void run();
        }}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-primary transition ${
            enabled ? "left-5" : "left-0.5"
          }`}
        />
      </button>
      {error && <span className="max-w-56 text-xs text-accent-red">{error}</span>}
      {currentConfirmation ? (
        <ConfirmationModal
          open={Boolean(confirming)}
          title={currentConfirmation.title}
          description={currentConfirmation.description}
          details={currentConfirmation.details}
          typedConfirmation={currentConfirmation.typedConfirmation}
          confirmLabel={confirming === "enable" ? "Enable" : "Disable"}
          pending={pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run()}
        />
      ) : null}
    </div>
  );
};