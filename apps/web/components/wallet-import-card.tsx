"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";

export const WalletImportCard = () => {
  const router = useRouter();
  const [name, setName] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Caution header */}
      <div className="flex items-center gap-3 rounded-lg border border-accent-yellow/30 bg-accent-yellow/5 px-4 py-3">
        <span className="inline-flex items-center rounded-xs border border-accent-yellow/40 bg-accent-yellow/15 px-2 py-0.5 text-[11px] font-semibold text-accent-yellow">
          CAUTION
        </span>
        <p className="text-sm text-muted">
          Private keys are encrypted before storage and never returned by the API.
          Plaintext CSV import is not supported.
        </p>
      </div>

      {/* Form */}
      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_1fr_auto]">
        <input
          className="h-10 rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none"
          placeholder="Wallet name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none"
          placeholder="Private key"
          type="password"
          value={privateKey}
          onChange={(event) => setPrivateKey(event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body placeholder:text-stone focus:border-hairline-strong focus:outline-none"
          placeholder="Notes optional"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending || !name.trim() || !privateKey.trim()}
          type="button"
          onClick={async () => {
            setPending(true);
            setMessage(null);
            try {
              await api.importWallet({
                name: name.trim(),
                privateKey: privateKey.trim(),
                notes: notes.trim() || null
              });
              setName("");
              setPrivateKey("");
              setNotes("");
              setMessage("Wallet imported and stored encrypted.");
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Import failed");
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? "Importing…" : "Add"}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.includes("failed") || message.includes("error") ? "text-accent-red" : "text-body"}`}>
          {message}
        </p>
      )}
    </div>
  );
};