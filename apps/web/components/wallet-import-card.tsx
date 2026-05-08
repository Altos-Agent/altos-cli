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
      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_1fr_auto]">
        <input
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          placeholder="Wallet name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          placeholder="Private key"
          type="password"
          value={privateKey}
          onChange={(event) => setPrivateKey(event.target.value)}
        />
        <input
          className="h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          placeholder="Notes optional"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
        <button
          className="h-10 rounded-md bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
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
          Add
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Add wallets one by one. Plaintext CSV private-key import is not
        supported.
      </p>
      {message && <p className="text-sm text-slate-300">{message}</p>}
    </div>
  );
};
