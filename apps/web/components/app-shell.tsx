import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BASE_NATIVE_SYMBOL } from "@base-orchestrator/shared";
import { api, isApiError } from "../lib/api";
import { LogoutButton } from "./logout-button";
import { SidebarNav } from "./sidebar-nav";
import { MobileDrawer } from "./mobile-drawer";
import { StatusBadge } from "./ui";

export const AppShell = async ({ children }: { children: ReactNode }) => {
  const auth = await api.getAuthMe();
  if (isApiError(auth) || !auth.data.authenticated) {
    redirect("/login");
  }
  const chainStatus = await api.getChainStatus();
  const runtimeStatus = await api.getRuntimeStatus();
  const runtimeData = isApiError(runtimeStatus) ? null : runtimeStatus.data;
  const demoMode = runtimeData?.demoMode ?? false;
  const dryRun = runtimeData?.dryRun ?? true;
  const emergencyPaused = runtimeData?.emergencyPaused === true;
  const vaultStatus = runtimeData?.vaultStatus.status ?? "LOCKED";

  return (
    <div className="min-h-screen bg-canvas text-body">
      <MobileDrawer />

      <div className="flex min-h-screen">
        <SidebarNav />

        <div className="min-w-0 flex-1">
          {/* Top bar */}
          <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/95 px-4 py-2.5 backdrop-blur md:px-6">
            {/* Safety banners */}
            {emergencyPaused && (
              <div className="-mx-4 -mt-2.5 mb-3 border-b border-accent-red/40 bg-accent-red/15 px-4 py-2 text-[13px] font-semibold text-accent-red md:-mx-6">
                ⚠ Global emergency pause is active. Live-impacting actions are blocked.
              </div>
            )}
            {!dryRun && !emergencyPaused && (
              <div className="-mx-4 -mt-2.5 mb-3 border-b border-accent-red/40 bg-accent-red/15 px-4 py-2 text-[13px] font-semibold text-accent-red md:-mx-6">
                ⚠ DRY_RUN is false. This environment can submit real transactions.
              </div>
            )}

            {/* Status row */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              {/* Mobile wordmark */}
              <Link
                href="/dashboard"
                className="text-xs font-semibold text-ink md:hidden"
              >
                base-orchestrator
              </Link>

              {/* Runtime badges */}
              <div className="flex flex-wrap items-center gap-1.5">
                {demoMode && <StatusBadge status="DEMO MODE" />}
                {dryRun ? (
                  <StatusBadge status="DRY RUN" />
                ) : (
                  <span className="inline-flex items-center rounded-xs border border-accent-red/40 bg-accent-red/15 px-2 py-0.5 text-[11px] font-semibold text-accent-red">
                    LIVE
                  </span>
                )}
                <StatusBadge status={`VAULT ${vaultStatus}`} />
                {emergencyPaused && <StatusBadge status="EMERGENCY PAUSED" />}
                {runtimeData?.baseChainId && (
                  <span className="rounded-xs border border-hairline bg-surface-elevated px-1.5 py-0.5 text-[11px] text-muted">
                    Base {runtimeData.baseChainId}
                  </span>
                )}
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                <span className="text-body">{auth.data.username}</span>
                <RoleBadge role={(auth.data as any).role ?? "viewer"} />
                <span>{BASE_NATIVE_SYMBOL}</span>
                <span>{runtimeData?.quoteProvider ?? "mock"}</span>
                <span>
                  Block{" "}
                  <span className="text-ink">
                    {isApiError(chainStatus)
                      ? "—"
                      : chainStatus.data.latestBlockNumber}
                  </span>
                </span>
                <span>
                  RPC{" "}
                  <span className={isApiError(chainStatus) ? "text-accent-red" : "text-accent-green"}>
                    {isApiError(chainStatus) ? "Offline" : "Online"}
                  </span>
                </span>
                <LogoutButton />
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="px-4 py-5 md:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
};
