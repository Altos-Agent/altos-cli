"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";

export const EmergencyPauseButton = ({ walletId }: { walletId: string }) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        className="h-10 rounded-md border border-accent-red/40 bg-accent-red-soft px-4 text-sm font-medium text-accent-red transition hover:bg-accent-red/20 disabled:opacity-60"
        disabled={pending}
        type="button"
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await api.emergencyPauseWallet(walletId);
            router.refresh();
          } catch (requestError) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "Emergency pause failed"
            );
          } finally {
            setPending(false);
          }
        }}
      >
        Emergency Pause
      </button>
      {error && <p className="text-sm text-accent-red">{error}</p>}
    </div>
  );
};