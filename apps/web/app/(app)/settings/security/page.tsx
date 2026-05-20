import { api, isApiError } from "../../../../lib/api";
import { GlobalEmergencyPauseButton } from "../../../../components/global-emergency-pause-button";
import { RouterManagement } from "../../../../components/router-management";
import { VaultControls } from "../../../../components/vault-controls";
import { Card, ErrorState, PageHeader, StatusBadge } from "../../../../components/ui";

const securityRules = [
  ["Dry-run default", "Enabled"],
  ["Seed phrase support", "Disabled"],
  ["Private-key storage", "Encrypted vault only"],
  ["Master key source", "MASTER_KEY_FILE"],
  ["Live execution", "Gated — requires vault unlock + explicit enable"]
] as const;

export default async function SecuritySettingsPage() {
  const [routers, tokens, pairs, vaultStatus, emergencyPause, runtimeStatus] = await Promise.all([
    api.getRouters(),
    api.getTokens(),
    api.getPairs(),
    api.getVaultStatus(),
    api.getEmergencyPause(),
    api.getRuntimeStatus()
  ]);

  const paused = !isApiError(emergencyPause) && emergencyPause.data.globalEmergencyPaused === true;
  const vaultStatusText = isApiError(vaultStatus) ? "UNAVAILABLE" : vaultStatus.data.status;
  const runtimeData = isApiError(runtimeStatus) ? null : runtimeStatus.data;
  const demoMode = runtimeData?.demoMode ?? false;
  const dryRun = runtimeData?.dryRun ?? true;
  const liveEnabled = runtimeData?.liveExecutionAllowed === true && !paused;
  const verificationBlockers = [
    ...(!isApiError(tokens)
      ? tokens.data
          .filter((token) => token.enabled && token.verificationStatus !== "VERIFIED")
          .map((token) => `Token ${token.symbol}: ${token.verificationStatus}`)
      : ["Token registry unavailable"]),
    ...(!isApiError(routers)
      ? routers.data
          .filter((router) => router.enabled && router.verificationStatus !== "VERIFIED")
          .map((router) => `Router ${router.name}: ${router.verificationStatus}`)
      : ["Router registry unavailable"]),
    ...(!isApiError(pairs)
      ? pairs.data
          .filter((pair) => pair.enabled && pair.verificationStatus !== "VERIFIED")
          .map((pair) => `Pair ${pair.tokenIn?.symbol ?? "?"}/${pair.tokenOut?.symbol ?? "?"}: ${pair.verificationStatus}`)
      : ["Pair registry unavailable"])
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Security"
        description="Local vault, dry-run, and operator safety posture for wallet automation."
      />

      {/* Runtime mode panel */}
      <Card className="p-5">
        <h2 className="text-sm font-medium text-ink">Runtime mode</h2>
        <p className="mt-1 text-xs text-muted">Current operator safety posture for all wallet operations.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-elevated px-4 py-3">
            <span className="text-sm text-muted">Demo mode</span>
            <span className={`text-sm font-medium ${demoMode ? "text-accent-yellow" : "text-accent-green"}`}>
              {demoMode ? "Active" : "Off"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-elevated px-4 py-3">
            <span className="text-sm text-muted">Dry-run</span>
            <span className={`text-sm font-medium ${dryRun ? "text-accent-green" : "text-accent-yellow"}`}>
              {dryRun ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-elevated px-4 py-3">
            <span className="text-sm text-muted">Live execution</span>
            <StatusBadge status={liveEnabled ? "LIVE" : "BLOCKED"} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-hairline bg-surface-elevated px-3 py-2">
          <span className="text-xs text-muted">Scheduler live:</span>
          <span className={`text-xs font-medium ${runtimeData?.schedulerLiveExecution ? "text-accent-yellow" : "text-stone"}`}>
            {runtimeData?.schedulerLiveExecution ? "Enabled" : "Disabled"}
          </span>
          <span className="text-xs text-stone">·</span>
          <span className="text-xs text-muted">Vault:</span>
          <StatusBadge status={`VAULT ${vaultStatusText}`} />
        </div>
      </Card>

      <Card className={`p-5 ${verificationBlockers.length > 0 ? "border-accent-yellow/30 bg-accent-yellow/5" : "border-accent-green/20 bg-accent-green/5"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-medium text-ink">Live readiness: verified registry</h2>
            <p className="mt-1 text-xs text-muted">
              Live approve, revoke, and execute-once require VERIFIED token, pair, router, tx target, and allowance target records with evidence.
            </p>
          </div>
          <StatusBadge status={verificationBlockers.length === 0 ? "VERIFIED" : "BLOCKED"} />
        </div>
        {verificationBlockers.length > 0 ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {verificationBlockers.slice(0, 8).map((blocker) => (
              <div key={blocker} className="rounded-md border border-accent-yellow/25 bg-surface-elevated px-3 py-2 text-xs text-accent-yellow">
                {blocker}
              </div>
            ))}
            {verificationBlockers.length > 8 && (
              <div className="rounded-md border border-hairline bg-surface-elevated px-3 py-2 text-xs text-stone">
                +{verificationBlockers.length - 8} more blockers
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-accent-green/25 bg-surface-elevated px-3 py-2 text-xs text-accent-green">
            All currently enabled registry records are VERIFIED. Runtime, vault, quote, risk, and idempotency gates still apply.
          </p>
        )}
      </Card>

      {/* Security rules */}
      <Card className="p-5">
        <h2 className="text-sm font-medium text-ink">Security posture</h2>
        <p className="mt-1 text-xs text-muted">Configured safety rules for this operator environment.</p>
        <div className="mt-4 divide-y divide-hairline">
          {securityRules.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <span className="text-sm text-muted">{label}</span>
              {value === "Enabled" || value === "Disabled" ? (
                <StatusBadge status={value} />
              ) : (
                <span className="text-sm font-medium text-body">{value}</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Emergency pause */}
      <Card className={`p-5 ${paused ? "border-accent-red/30 bg-accent-red/5" : ""}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-ink">Global emergency pause</h2>
              <span className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-[11px] font-medium ${
                paused
                  ? "border-accent-red/40 bg-accent-red/20 text-accent-red"
                  : "border-hairline bg-surface-elevated text-stone"
              }`}>
                {paused ? "ACTIVE" : "OFF"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {paused
                ? "Live-impacting controls are globally blocked. Approvals, revokes, execute-once, and scheduler start are all paused."
                : "All live-impacting controls are governed by their individual gates."}
            </p>
          </div>
          {isApiError(emergencyPause) ? (
            <ErrorState
              title="Emergency pause API unavailable"
              description={emergencyPause.message}
            />
          ) : (
            <GlobalEmergencyPauseButton paused={paused} />
          )}
        </div>
      </Card>

      {/* Vault */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-medium text-ink">Vault</h2>
            <p className="mt-2 text-sm text-muted">
              {vaultStatusText === "UNLOCKED"
                ? "Vault is unlocked. Live signing is possible if all other gates are open."
                : "Vault is locked. Live signing requires an unlocked vault. Dry-run planning does not."}
            </p>
          </div>
          <StatusBadge status={vaultStatusText} />
        </div>
        {isApiError(vaultStatus) ? (
          <ErrorState title="Vault API unavailable" description={vaultStatus.message} />
        ) : (
          <div className="mt-4">
            <VaultControls status={vaultStatus.data.status} />
          </div>
        )}
      </Card>

      {/* Routers */}
      <Card className="p-5">
        <h2 className="text-sm font-medium text-ink">Router management</h2>
        <p className="mt-1 text-xs text-muted">
          Routers must be verified and enabled before an enabled pair can use them.
        </p>
        {isApiError(routers) ? (
          <ErrorState title="Router API unavailable" description={routers.message} />
        ) : (
          <div className="mt-4">
            <RouterManagement routers={routers.data} />
          </div>
        )}
      </Card>
    </div>
  );
}
