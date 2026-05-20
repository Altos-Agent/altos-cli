import Link from "next/link";
import { Card, PageHeader, StatusBadge } from "../../../components/ui";

const settingsSections = [
  {
    title: "Telegram",
    href: "/settings/telegram",
    description: "Notification toggles, encrypted bot-token placeholder, and test action.",
    badge: null,
    icon: (
      <svg className="size-5 text-muted" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
        <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm3.5 5.5l-4.5 2.7-1.5 1.5-2-1.8 1.2-1.4L11 9V6l4.5 1.5z" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    title: "Security",
    href: "/settings/security",
    description: "Dry-run mode, vault rules, emergency pause, router management, and secret handling.",
    badge: null,
    icon: (
      <svg className="size-5 text-muted" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
        <path d="M10 2L4 5v5c0 4.4 2.6 8.5 6 9.9 3.4-1.4 6-5.5 6-9.9V5l-6-3z" strokeLinejoin="round" />
        <path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
] as const;

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Local runtime controls and operator preferences. Write actions are intentionally staged until endpoints are available."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {settingsSections.map(({ title, href, description, badge, icon }) => (
          <Link key={href} href={href}>
            <Card className="group relative p-5 transition-colors hover:border-hairline-strong">
              <div className="flex items-start gap-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-hairline bg-surface-elevated text-muted group-hover:text-body">
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-medium text-ink">{title}</h2>
                    {badge ?? <StatusBadge status="PAUSED" />}
                  </div>
                  <p className="mt-1.5 text-sm text-muted leading-relaxed">
                    {description}
                  </p>
                </div>
                <svg className="size-4 shrink-0 self-center text-stone group-hover:text-muted transition-colors" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}