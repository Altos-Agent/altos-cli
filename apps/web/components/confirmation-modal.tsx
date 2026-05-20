"use client";

import { useMemo, useState } from "react";

export interface ConfirmationDetail {
  label: string;
  value: string | null | undefined;
}

export const ConfirmationModal = ({
  open,
  title,
  description,
  details,
  confirmLabel,
  typedConfirmation,
  onCancel,
  onConfirm,
  pending = false
}: {
  open: boolean;
  title: string;
  description: string;
  details: ConfirmationDetail[];
  confirmLabel: string;
  typedConfirmation?: string | undefined;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) => {
  const [typedValue, setTypedValue] = useState("");
  const normalizedTypedValue = typedValue.trim().toUpperCase();
  const canConfirm = useMemo(
    () =>
      !pending &&
      (!typedConfirmation ||
        normalizedTypedValue === typedConfirmation.toUpperCase()),
    [normalizedTypedValue, pending, typedConfirmation]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-lg border border-hairline bg-surface-elevated p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-body">
              {description}
            </p>
          </div>
          <button
            className="rounded-md border border-hairline px-2 py-1 text-xs text-body hover:bg-surface-card"
            type="button"
            onClick={onCancel}
          >
            Close
          </button>
        </div>

        <dl className="mt-5 divide-y divide-hairline rounded-md border border-hairline bg-surface">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[140px_1fr]"
            >
              <dt className="text-muted">{detail.label}</dt>
              <dd className="break-all text-ink">
                {detail.value ?? "Not available"}
              </dd>
            </div>
          ))}
        </dl>

        {typedConfirmation ? (
          <label className="mt-4 block text-sm text-body">
            Type <span className="font-medium text-ink">{typedConfirmation}</span> to
            confirm.
            <input
              aria-label={`Type ${typedConfirmation} to confirm`}
              className="mt-2 h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm uppercase text-ink"
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
            />
          </label>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            className="h-9 rounded-md border border-hairline bg-surface-elevated px-3 text-sm font-medium text-body hover:border-hairline-strong"
            type="button"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="h-9 rounded-md border border-accent-red/40 bg-accent-red-soft px-3 text-sm font-medium text-accent-red hover:bg-accent-red/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canConfirm}
            type="button"
            onClick={onConfirm}
          >
            {pending ? "Working" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};