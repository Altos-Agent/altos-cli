"use client";

import { useState } from "react";
import { api } from "../lib/api";

export function SecuritySettings() {
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Two-Factor Authentication</h2>
        <p className="mb-4 text-sm text-gray-400">
          Two-factor authentication adds an extra layer of security to your account by requiring
          a time-based one-time password (TOTP) in addition to your password.
        </p>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-semibold ${mfaEnabled ? "bg-green-900 text-green-200" : "bg-gray-700 text-gray-300"}`}>
            {mfaEnabled ? "ENABLED" : "DISABLED"}
          </span>
          {!mfaEnabled && (
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              onClick={() => {}}
            >
              Enable 2FA
            </button>
          )}
          {mfaEnabled && (
            <button
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              onClick={() => {}}
            >
              Disable 2FA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}