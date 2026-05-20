import { useState } from "react";

interface ConfirmationModalProps {
  action: string;
  phrase: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({ action, phrase, description, onConfirm, onCancel }: ConfirmationModalProps) {
  const [value, setValue] = useState("");
  const matches = value.trim().toUpperCase() === phrase.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-2 text-lg font-semibold text-white">{action}</h2>
        <p className="mb-4 text-sm text-gray-400">{description}</p>
        <div className="mb-4 rounded-lg border border-gray-700 bg-gray-800 p-3">
          <p className="mb-2 text-xs text-gray-500">Type to confirm:</p>
          <p className="font-mono text-lg font-bold text-white">{phrase}</p>
        </div>
        <input
          type="text"
          className="mb-4 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-red-500 focus:outline-none"
          placeholder={`Type "${phrase}" to confirm`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white" onClick={onCancel}>Cancel</button>
          <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40" disabled={!matches} onClick={onConfirm}>
            Confirm {action}
          </button>
        </div>
      </div>
    </div>
  );
}