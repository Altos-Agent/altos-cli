"use client";

import { useState } from "react";
import {
  api,
  isApiError,
  type UpdateTelegramSettingsRequest
} from "../lib/api";
import type { NotificationDelivery, TelegramSettings } from "../lib/types";
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
  <label className="flex items-center justify-between gap-4 rounded-lg border border-hairline bg-surface-elevated p-4">
    <span className="text-sm font-medium text-ink">{label}</span>
    <input
      checked={checked}
      className="h-5 w-5 accent-accent-blue"
      type="checkbox"
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Never";

const StatusPill = ({ label, active }: { label: string; active: boolean }) => (
  <div
    className={`rounded-md border px-3 py-2 text-sm ${
      active
        ? "border-accent-red/30 bg-accent-red-soft text-accent-red"
        : "border-accent-green/25 bg-accent-green-soft text-accent-green"
    }`}
  >
    {label}
  </div>
);

const DeliveryRow = ({ delivery }: { delivery: NotificationDelivery }) => (
  <tr>
    <td className="py-3 pr-4 text-ink">{delivery.eventType}</td>
    <td className="py-3 pr-4">
      <StatusBadge status={delivery.status} />
    </td>
    <td className="py-3 pr-4 text-muted">
      {delivery.destinationPreview ?? "No destination"}
    </td>
    <td className="py-3 pr-4 text-muted">
      {delivery.requestId ?? "No request"}
    </td>
    <td className="py-3 pr-4 text-muted">
      {delivery.jobId ?? "No job"}
    </td>
    <td className="py-3 pr-4 text-muted">{formatDate(delivery.createdAt)}</td>
    <td className="py-3 pr-4 text-accent-red">
      {delivery.errorCode ?? delivery.errorMessage ?? ""}
    </td>
  </tr>
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
  const [lastTestStatus, setLastTestStatus] = useState(
    initialSettings?.lastTestStatus ?? null
  );
  const [lastDeliveryAt, setLastDeliveryAt] = useState(
    initialSettings?.lastDeliveryAt ?? null
  );
  const [recentDeliveries, setRecentDeliveries] = useState(
    initialSettings?.recentDeliveries ?? []
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Stored token</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {tokenPreview ?? "Not configured"}
          </p>
        </div>
        <StatusBadge status={enabled ? "Enabled" : "Disabled"} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatusPill
          label={enabled ? "Notifications enabled" : "Notifications disabled"}
          active={!enabled}
        />
        <StatusPill
          label={tokenPreview ? "Bot token configured" : "Bot token missing"}
          active={!tokenPreview}
        />
        <StatusPill
          label={chatId.trim() ? "Chat ID configured" : "Chat ID missing"}
          active={!chatId.trim()}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-hairline bg-surface-elevated p-3">
          <p className="text-xs uppercase text-muted">Last test status</p>
          <p className="mt-2 text-sm font-medium text-ink">
            {lastTestStatus ?? "No test recorded"}
          </p>
        </div>
        <div className="rounded-md border border-hairline bg-surface-elevated p-3">
          <p className="text-xs uppercase text-muted">Last delivery</p>
          <p className="mt-2 text-sm font-medium text-ink">
            {formatDate(lastDeliveryAt)}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-accent-red/30 bg-accent-red-soft p-3 text-sm text-accent-red">
          {error}
        </div>
      )}
      {status && (
        <div className="rounded-md border border-accent-green/30 bg-accent-green-soft p-3 text-sm text-accent-green">
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
          <span className="text-sm font-medium text-body">Bot token</span>
          <input
            className="mt-2 h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
            placeholder="Paste BotFather token to replace"
            type="password"
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-body">Chat ID</span>
          <input
            className="mt-2 h-10 w-full rounded-md border border-hairline bg-surface-elevated px-3 text-sm text-body"
            placeholder="123456789"
            type="text"
            value={chatId}
            onChange={(event) => setChatId(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
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
              setLastTestStatus(updated.lastTestStatus);
              setLastDeliveryAt(updated.lastDeliveryAt);
              setRecentDeliveries(updated.recentDeliveries);
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
          className="h-10 rounded-md border border-hairline bg-surface-elevated px-4 text-sm font-medium text-body transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="button"
          onClick={async () => {
            setPending(true);
            setError(null);
            setStatus(null);
            try {
              const result = await api.testTelegramSettings();
              setStatus(`Test notification sent at ${result.sentAt}`);
              setLastTestStatus("SENT");
              setLastDeliveryAt(result.sentAt);
              const refreshed = await api.getTelegramSettings();
              if (isApiError(refreshed)) {
                setError(refreshed.message);
              } else {
                setRecentDeliveries(refreshed.data.recentDeliveries);
                setLastTestStatus(refreshed.data.lastTestStatus);
                setLastDeliveryAt(refreshed.data.lastDeliveryAt);
              }
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

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="min-w-full divide-y divide-hairline text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-3 pr-4">Event</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Destination</th>
              <th className="py-3 pr-4">Request</th>
              <th className="py-3 pr-4">Job</th>
              <th className="py-3 pr-4">Created</th>
              <th className="py-3 pr-4">Issue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {recentDeliveries.length === 0 ? (
              <tr>
                <td className="py-4 text-sm text-muted" colSpan={7}>
                  No notification deliveries recorded yet.
                </td>
              </tr>
            ) : (
              recentDeliveries.map((delivery) => (
                <DeliveryRow key={delivery.id} delivery={delivery} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};