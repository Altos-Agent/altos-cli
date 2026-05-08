"use client";

import { useState } from "react";
import { api, type UpdateTelegramSettingsRequest } from "../lib/api";
import type { TelegramSettings } from "../lib/types";
import { StatusBadge } from "./ui";

const Toggle = ({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-slate-950/35 p-4">
    <span className="text-sm font-medium text-slate-100">{label}</span>
    <input
      checked={checked}
      className="h-5 w-5 accent-blue-500"
      type="checkbox"
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

export const TelegramSettingsForm = ({
  initialSettings
}: {
  initialSettings: TelegramSettings | null;
}) => {
  const [enabled, setEnabled] = useState(initialSettings?.enabled ?? false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState(initialSettings?.chatId ?? "");
  const [notifyOnSubmitted, setNotifyOnSubmitted] = useState(
    initialSettings?.notifyOnSubmitted ?? true
  );
  const [notifyOnConfirmed, setNotifyOnConfirmed] = useState(
    initialSettings?.notifyOnConfirmed ?? true
  );
  const [notifyOnFailed, setNotifyOnFailed] = useState(
    initialSettings?.notifyOnFailed ?? true
  );
  const [notifyOnRejected, setNotifyOnRejected] = useState(
    initialSettings?.notifyOnRejected ?? true
  );
  const [notifyOnDryRun, setNotifyOnDryRun] = useState(
    initialSettings?.notifyOnDryRun ?? true
  );
  const [tokenPreview, setTokenPreview] = useState(
    initialSettings?.tokenPreview ?? null
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Stored token</p>
          <p className="mt-1 text-sm font-medium text-slate-100">
            {tokenPreview ?? "Not configured"}
          </p>
        </div>
        <StatusBadge status={enabled ? "Enabled" : "Disabled"} />
      </div>

      {error && (
        <div className="rounded-md border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">
          {error}
        </div>
      )}
      {status && (
        <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">
          {status}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Toggle label="Enabled" checked={enabled} onChange={setEnabled} />
        <Toggle
          label="Notify dry-run accepted/rejected"
          checked={notifyOnDryRun}
          onChange={setNotifyOnDryRun}
        />
        <Toggle
          label="Notify submitted"
          checked={notifyOnSubmitted}
          onChange={setNotifyOnSubmitted}
        />
        <Toggle
          label="Notify confirmed"
          checked={notifyOnConfirmed}
          onChange={setNotifyOnConfirmed}
        />
        <Toggle
          label="Notify failed"
          checked={notifyOnFailed}
          onChange={setNotifyOnFailed}
        />
        <Toggle
          label="Notify rejected / emergency"
          checked={notifyOnRejected}
          onChange={setNotifyOnRejected}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-300">Bot token</span>
          <input
            className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
            placeholder="Paste BotFather token to replace"
            type="password"
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-300">Chat ID</span>
          <input
            className="mt-2 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
            placeholder="123456789"
            type="text"
            value={chatId}
            onChange={(event) => setChatId(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="h-10 rounded-md bg-blue-500 px-4 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="button"
          onClick={async () => {
            setPending(true);
            setError(null);
            setStatus(null);
            try {
              const payload: UpdateTelegramSettingsRequest = {
                enabled,
                chatId: chatId.trim() === "" ? null : chatId.trim(),
                notifyOnSubmitted,
                notifyOnConfirmed,
                notifyOnFailed,
                notifyOnRejected,
                notifyOnDryRun
              };
              const trimmedBotToken = botToken.trim();
              if (trimmedBotToken !== "") {
                payload.botToken = trimmedBotToken;
              }
              const updated = await api.updateTelegramSettings({
                ...payload
              });
              setTokenPreview(updated.tokenPreview);
              setBotToken("");
              setStatus("Telegram settings saved");
            } catch (requestError) {
              setError(
                requestError instanceof Error
                  ? requestError.message
                  : "Save failed"
              );
            } finally {
              setPending(false);
            }
          }}
        >
          Save
        </button>
        <button
          className="h-10 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="button"
          onClick={async () => {
            setPending(true);
            setError(null);
            setStatus(null);
            try {
              const result = await api.testTelegramSettings();
              setStatus(`Test notification sent at ${result.sentAt}`);
            } catch (requestError) {
              setError(
                requestError instanceof Error
                  ? requestError.message
                  : "Test failed"
              );
            } finally {
              setPending(false);
            }
          }}
        >
          Send test
        </button>
      </div>
    </div>
  );
};
