import { api } from "../../../../lib/api";
import { RouterManagement } from "../../../../components/router-management";
import { Card, PageHeader, StatusBadge } from "../../../../components/ui";

const rules = [
  ["Dry-run default", "Enabled"],
  ["Seed phrase support", "Disabled"],
  ["Private-key storage", "Encrypted vault only"],
  ["Master key source", "MASTER_KEY_FILE"],
  ["Live execution", "Not implemented"]
] as const;

export default async function SecuritySettingsPage() {
  const routers = await api.getRouters();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Local vault, dry-run, and operator safety posture for wallet automation."
      />
      <Card className="p-5">
        <div className="divide-y divide-white/10">
          {rules.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <span className="text-sm text-slate-400">{label}</span>
              {value === "Enabled" || value === "Disabled" ? (
                <StatusBadge status={value} />
              ) : (
                <span className="text-sm font-medium text-slate-100">
                  {value}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-50">Routers</h2>
        <p className="mt-2 text-sm text-slate-400">
          Routers must be verified and enabled before an enabled pair can use
          them.
        </p>
        <RouterManagement routers={routers} />
      </Card>
    </div>
  );
}
