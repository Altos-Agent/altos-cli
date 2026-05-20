import { api, isApiError } from "../../../../lib/api";
import { Card, ErrorState, PageHeader } from "../../../../components/ui";
import { TelegramSettingsForm } from "../../../../components/telegram-settings-form";

export default async function TelegramSettingsPage() {
  const settings = await api.getTelegramSettings();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Telegram"
        description="Configure local Telegram notifications. Bot tokens are encrypted before storage and never returned by the API."
      />

      {/* Security note */}
      <div className="flex items-start gap-3 rounded-lg border border-accent-yellow/30 bg-accent-yellow/5 px-4 py-3">
        <span className="mt-0.5 inline-flex items-center rounded-xs border border-accent-yellow/40 bg-accent-yellow/15 px-2 py-0.5 text-[11px] font-semibold text-accent-yellow shrink-0">
          NOTE
        </span>
        <p className="text-sm text-muted">
          Telegram is third-party infrastructure. Do not paste bot tokens into screenshots, logs, or shared debugging sessions.
        </p>
      </div>

      <Card className="p-5">
        {isApiError(settings) ? (
          <ErrorState title="Telegram settings unavailable" description={settings.message} />
        ) : (
          <TelegramSettingsForm initialSettings={settings.data} />
        )}
      </Card>
    </div>
  );
}