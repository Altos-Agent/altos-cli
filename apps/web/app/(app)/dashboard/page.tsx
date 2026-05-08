import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import { api } from "../../../lib/api";
import { SchedulerControls } from "../../../components/scheduler-controls";
import { Card, PageHeader, StatusBadge } from "../../../components/ui";

const metricLabel = "text-sm text-slate-400";
const metricValue = "mt-3 text-3xl font-semibold text-slate-50";

export default async function DashboardPage() {
  const summary = await api.getDashboardSummary();

  const cards = [
    ["Active wallets", summary.activeWallets],
    ["Paused wallets", summary.pausedWallets],
    ["Total submitted tx", summary.totalSubmittedTx],
    ["Confirmed tx", summary.confirmedTx],
    ["Failed tx", summary.failedTx]
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="A local-first control surface for wallet state, Base read-only status, and transaction review readiness."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className={metricLabel}>{label}</p>
            <p className={metricValue}>{value}</p>
          </Card>
        ))}
        <Card className="p-5">
          <p className={metricLabel}>Dry-run status</p>
          <div className="mt-4">
            <StatusBadge status={summary.dryRunStatus} />
          </div>
        </Card>
        <Card className="p-5">
          <p className={metricLabel}>Telegram status</p>
          <div className="mt-4">
            <StatusBadge status={summary.telegramStatus} />
          </div>
        </Card>
        <Card className="p-5">
          <p className={metricLabel}>Base chain status</p>
          <p className="mt-3 text-lg font-semibold text-slate-50">
            Chain {summary.chainStatus?.chainId ?? BASE_CHAIN_ID}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Block {summary.chainStatus?.latestBlockNumber ?? "Unavailable"}
          </p>
        </Card>
        <Card className="p-5">
          <p className={metricLabel}>Scheduler status</p>
          <div className="mt-4">
            <SchedulerControls initialStatus={summary.schedulerStatus} />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-50">Queue health</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {summary.schedulerStatus
            ? Object.entries(summary.schedulerStatus.queues).map(
                ([name, counts]) => (
                  <div
                    key={name}
                    className="rounded-md border border-white/10 bg-slate-950/35 p-3"
                  >
                    <p className="text-sm font-medium text-slate-100">{name}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Waiting {counts.waiting ?? 0} | Active{" "}
                      {counts.active ?? 0} | Failed {counts.failed ?? 0}
                    </p>
                  </div>
                )
              )
            : null}
        </div>
      </Card>
    </div>
  );
}
