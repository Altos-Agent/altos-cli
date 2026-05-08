import { api } from "../../../../lib/api";
import { TelegramSettingsForm } from "../../../../components/telegram-settings-form";
import { Card, PageHeader } from "../../../../components/ui";

export default async function TelegramSettingsPage() {
  const settings = await api.getTelegramSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Telegram"
        description="Configure local Telegram notifications. Bot tokens are encrypted before storage and never returned by the API."
      />
      <Card className="p-5">
        <TelegramSettingsForm initialSettings={settings} />
      </Card>
    </div>
  );
}
