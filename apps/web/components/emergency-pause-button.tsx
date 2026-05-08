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
        className="h-10 rounded-md bg-rose-500 px-4 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
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
      {error && <p className="text-sm text-rose-200">{error}</p>}
    </div>
  );
};
