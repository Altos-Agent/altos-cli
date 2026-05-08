"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";

export const RefreshTransactionButton = ({
  transactionId
}: {
  transactionId: string;
}) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        className="h-9 rounded-md bg-blue-500 px-3 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="button"
        onClick={async () => {
          setPending(true);
          setMessage(null);
          try {
            const result = await api.refreshTransaction(transactionId);
            setMessage(
              result.refreshed
                ? `Updated to ${result.transaction.status}`
                : result.reason
            );
            router.refresh();
          } catch (requestError) {
            setMessage(
              requestError instanceof Error
                ? requestError.message
                : "Refresh failed"
            );
          } finally {
            setPending(false);
          }
        }}
      >
        Refresh status
      </button>
      {message && <p className="text-sm text-slate-400">{message}</p>}
    </div>
  );
};
