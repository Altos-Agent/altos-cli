import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "../../../components/ui";

const settingsLinks = [
  [
    "Telegram",
    "/settings/telegram",
    "Notification toggles, encrypted bot-token placeholder, and test action."
  ],
  [
    "Security",
    "/settings/security",
    "Dry-run mode, vault rules, secret handling, and local master-key notes."
  ]
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Local runtime controls and operator preferences. Write actions are intentionally staged until endpoints are available."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {settingsLinks.map(([title, href, description]) => (
          <Link key={href} href={href}>
            <Card className="p-5 transition hover:border-blue-400/30">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-50">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {description}
                  </p>
                </div>
                <StatusBadge status="PAUSED" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
