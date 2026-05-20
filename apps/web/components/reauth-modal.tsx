import { useState } from "react";
import { api } from "../lib/api";

interface ReauthModalProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ReauthModal({ onSuccess, onCancel }: ReauthModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.reauth(password);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Re-authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-white">Re-authenticate</h2>
        <p className="mb-4 text-sm text-gray-400">
          This action requires recent authentication. Please enter your password to continue.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="mb-3 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-white" onClick={onCancel}>Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50" disabled={loading || !password}>
              {loading ? "Verifying..." : "Re-authenticate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}