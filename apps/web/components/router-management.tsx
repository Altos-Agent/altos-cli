"use client";

import type { RouterConfig } from "../lib/types";
import { ActionToggle } from "./action-toggle";
import { EmptyState, StatusBadge } from "./ui";

export const RouterManagement = ({ routers }: { routers: RouterConfig[] }) => {
  if (routers.length === 0) {
    return (
      <EmptyState
        title="No routers seeded"
        description="Run the database seed to add 0x, Uniswap Universal Router, and Aerodrome placeholders."
      />
    );
  }

  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-white/10">
      <table className="min-w-full divide-y divide-white/10 text-sm">
        <thead className="bg-slate-950/60 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Router</th>
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Address</th>
            <th className="px-4 py-3">Enabled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {routers.map((router) => (
            <tr key={router.id}>
              <td className="px-4 py-3">
                <p className="font-medium text-slate-100">{router.name}</p>
                <p className="text-xs text-slate-500">{router.notes}</p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={router.riskLevel} />
              </td>
              <td className="px-4 py-3 text-slate-500">
                {router.address ?? "Requires verification"}
              </td>
              <td className="px-4 py-3">
                <ActionToggle
                  enabled={router.enabled}
                  label={`Toggle ${router.name}`}
                  enablePath={`/api/routers/${router.id}/enable`}
                  disablePath={`/api/routers/${router.id}/disable`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
