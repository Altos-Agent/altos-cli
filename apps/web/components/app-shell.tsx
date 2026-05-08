import Link from "next/link";
import type { ReactNode } from "react";
import { BASE_CHAIN_ID, BASE_NATIVE_SYMBOL } from "@base-orchestrator/shared";
import { api } from "../lib/api";
import { navLinks } from "../lib/nav";
import { SidebarNav } from "./sidebar-nav";
import { StatusBadge } from "./ui";

export const AppShell = async ({ children }: { children: ReactNode }) => {
  const chainStatus = await api.getChainStatus();
  const demoMode = process.env.DEMO_MODE === "true";
  const dryRun = process.env.DRY_RUN !== "false";

  return (
    <div className="min-h-screen bg-[#080c13] text-slate-100">
      <div className="flex min-h-screen">
        <SidebarNav />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#080c13]/95 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="text-sm font-semibold text-slate-50 md:hidden"
                >
                  base-orchestrator
                </Link>
                {demoMode && <StatusBadge status="Demo Mode" />}
                {dryRun ? (
                  <StatusBadge status="Dry Run" />
                ) : (
                  <span className="inline-flex items-center rounded-md border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-100">
                    Live Mode: transactions can be sent
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span>Base {BASE_CHAIN_ID}</span>
                <span>{BASE_NATIVE_SYMBOL}</span>
                <span>
                  Block{" "}
                  <span className="text-slate-200">
                    {chainStatus?.latestBlockNumber ?? "Unavailable"}
                  </span>
                </span>
                <span>
                  RPC{" "}
                  <span className="text-slate-200">
                    {chainStatus ? "Connected" : "Offline"}
                  </span>
                </span>
              </div>
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 md:hidden">
              {navLinks.map(([label, href]) => (
                <Link
                  key={href}
                  className="shrink-0 rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300"
                  href={href}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="px-4 py-6 md:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
};
