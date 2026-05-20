"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../lib/api";
import { ConfirmationModal } from "./confirmation-modal";

export const VaultControls = ({ status }: { status: string }) => {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUnlock, setConfirmUnlock] = useState(false);

  const unlock = async () => {
    setPending(true);
    setError(null);
    try {
      await api.unlockVault({
        username: "operator",
        ...(password ? { password } : {}),
        ...(passphrase ? { passphrase } : {})
      });
      setPassword("");
      setPassphrase("");
      setConfirmUnlock(false);
      router.refresh();
    } catch (unlockError) {
      setError(
        unlockError instanceof Error
          ? unlockError.message
          : "Vault unlock failed"
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      {status === "LOCKED" ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className="rounded-md border border-hairline bg-surface-elevated px-3 py-2 text-sm text-ink outline-none focus:border-hairline-strong"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Operator password"
          />
          <input
            className="rounded-md border border-hairline bg-surface-elevated px-3 py-2 text-sm text-ink outline-none focus:border-hairline-strong"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="Vault passphrase"
          />
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:opacity-60"
            disabled={pending || (!password && !passphrase)}
            type="button"
            onClick={() => setConfirmUnlock(true)}
          >
            Unlock
          </button>
        </div>
      ) : (
        <button
          className="rounded-md border border-hairline bg-surface-elevated px-4 py-2 text-sm font-medium text-body transition hover:bg-surface-card disabled:opacity-60"
          disabled={pending}
          type="button"
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              await api.lockVault();
              router.refresh();
            } catch (lockError) {
              setError(
                lockError instanceof Error
                  ? lockError.message
                  : "Vault lock failed"
              );
            } finally {
              setPending(false);
            }
          }}
        >
          Lock vault
        </button>
      )}
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <ConfirmationModal
        open={confirmUnlock}
        title="Unlock vault"
        description="Unlocking the vault enables live signing only if every live-mode gate is also explicitly open."
        typedConfirmation="UNLOCK VAULT"
        confirmLabel="Unlock vault"
        pending={pending}
        details={[
          { label: "Current vault", value: status },
          { label: "Operator", value: "operator" },
          {
            label: "Credential source",
            value: passphrase ? "Vault passphrase" : "Operator password"
          },
          {
            label: "Risk summary",
            value: "Decrypted signing access is temporarily available in process"
          }
        ]}
        onCancel={() => setConfirmUnlock(false)}
        onConfirm={() => void unlock()}
      />
    </div>
  );
};