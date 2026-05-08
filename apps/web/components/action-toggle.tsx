"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "../lib/api";

export const ActionToggle = ({
  enabled,
  enablePath,
  disablePath,
  label
}: {
  enabled: boolean;
  enablePath: string;
  disablePath: string;
  label: string;
}) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        aria-label={label}
        className={`relative h-6 w-11 rounded-full border transition ${
          enabled
            ? "border-emerald-400/40 bg-emerald-500/30"
            : "border-slate-700 bg-slate-800"
        } ${pending ? "opacity-60" : ""}`}
        disabled={pending}
        type="button"
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await apiRequest(enabled ? disablePath : enablePath, {
              method: "POST"
            });
            router.refresh();
          } catch (requestError) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Update failed"
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
            enabled ? "left-5" : "left-0.5"
          }`}
        />
      </button>
      {error && <span className="max-w-56 text-xs text-rose-300">{error}</span>}
    </div>
  );
};
