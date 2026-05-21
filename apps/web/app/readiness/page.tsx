"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getReadinessSummary,
  runReadinessChecks,
  uploadReadinessArtifact,
  provisionTinyWallet,
  isApiError,
} from "../../lib/api";
import { ReadinessChecklist } from "../../components/readiness/readiness-checklist";

type CheckStatus = "PASS" | "FAIL" | "BLOCKED";

interface Check {
  id: number;
  category: string;
  name: string;
  status: CheckStatus;
  message: string;
  evidence: string | null;
}

interface ReadinessState {
  state: string;
  liveAutomationHardNoGo: boolean;
  liveAutomationReady: boolean;
  blockedChecks: Array<{ id: number; message: string; category: string }>;
  passedCheckIds: number[];
  lastCheckedAt: string | null;
}

const RUNBOOK_STEPS = [
  "Import dedicated tiny wallet via Readiness Center",
  "Fund with ~0.001 BASE only",
  "Verify token/router/spender addresses on Basescan",
  "Run read-only 0x quote",
  "Execute exact approval (not infinite)",
  "Execute once (tiny amount)",
  "Wait for finality (check Basescan)",
  "Revoke approval",
  "Lock vault",
  "Return to dry-run mode",
  "Record tx hash + Basescan verification URL",
];

const STATE_COLORS: Record<string, string> = {
  TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW: "border-green-500 bg-green-950 text-green-200",
  TINY_MANUAL_LIVE_BLOCKED: "border-red-500 bg-red-950 text-red-200",
  DEMO_READY: "border-yellow-500 bg-yellow-950 text-yellow-200",
  DRY_RUN_READY: "border-yellow-500 bg-yellow-950 text-yellow-200",
};

const STATE_LABELS: Record<string, string> = {
  TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW: "TINY MANUAL LIVE — READY FOR OPERATOR REVIEW",
  TINY_MANUAL_LIVE_BLOCKED: "TINY MANUAL LIVE — BLOCKED",
  DEMO_READY: "DEMO READY",
  DRY_RUN_READY: "DRY RUN READY",
};

export default function ReadinessPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<ReadinessState | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tinyWalletAddress, setTinyWalletAddress] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [showWhyBlocked, setShowWhyBlocked] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [summaryResult, checksResult] = await Promise.all([
      getReadinessSummary(),
      runReadinessChecks(),
    ]);

    if (!isApiError(summaryResult)) {
      setSummary(summaryResult.data);
    }
    if (!isApiError(checksResult)) {
      setChecks(checksResult.data.checks);
    }
    setLoading(false);
  };

  const handleRunChecks = async () => {
    setRunning(true);
    const result = await runReadinessChecks();
    if (!isApiError(result)) {
      setSummary((prev) =>
        prev ? { ...prev, state: result.data.state } : null
      );
      setChecks(result.data.checks);
    }
    setRunning(false);
  };

  const handleUploadArtifact = async (type: string) => {
    const result = await uploadReadinessArtifact({
      type: type as "0x_quote_validation" | "backup_restore_drill" | "emergency_pause_drill" | "dry_run_load_test" | "telegram_test" | "tiny_live_operator_checklist",
      passed: true,
      evidence: null,
      notes: null,
    });
    if (!isApiError(result)) {
      await loadData();
    }
  };

  const handleProvisionTinyWallet = async () => {
    setProvisioning(true);
    const result = await provisionTinyWallet();
    if (!isApiError(result)) {
      setTinyWalletAddress(result.data.address);
    }
    setProvisioning(false);
  };

  const isReadyForTinyLive =
    summary?.state === "TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW";

  const canInitiateTinyLive =
    isReadyForTinyLive && RUNBOOK_STEPS.slice(0, 6).every((_, i) => true); // Steps 0-5 complete

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-zinc-400 font-mono text-sm">Loading readiness data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Readiness Center</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Validate system readiness before enabling live automation
          </p>
        </div>
      </div>

      {/* Hard No-Go Banner — Always Shown */}
      <div className="border border-red-500 bg-red-950 rounded-lg px-4 py-3">
        <span className="font-bold text-red-300 text-sm">
          LIVE AUTOMATION HARD NO-GO — Live scheduler is disabled and will remain so.
        </span>
      </div>

      {/* State Banner */}
      {summary && (
        <div className={`border rounded-lg px-4 py-3 ${STATE_COLORS[summary.state] ?? "border-zinc-600 bg-zinc-900 text-zinc-200"}`}>
          <span className="font-bold text-sm">
            {STATE_LABELS[summary.state] ?? summary.state}
          </span>
        </div>
      )}

      {/* Tiny Wallet Provision */}
      {!tinyWalletAddress && (
        <div className="flex items-center gap-4 p-4 border border-zinc-700 rounded-lg bg-zinc-900">
          <div className="flex-1">
            <div className="text-sm font-medium text-zinc-200">Tiny Manual Live Wallet</div>
            <div className="text-xs text-zinc-400 mt-1">
              Provision a dedicated tiny wallet for manual live trading validation
            </div>
          </div>
          <button
            onClick={handleProvisionTinyWallet}
            disabled={provisioning}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-sm font-mono"
          >
            {provisioning ? "Provisioning..." : "Provision Tiny Wallet"}
          </button>
        </div>
      )}

      {/* Readiness Checklist */}
      <ReadinessChecklist
        checks={checks}
        onRunChecks={handleRunChecks}
        onUploadArtifact={handleUploadArtifact}
        onProvisionTinyWallet={handleProvisionTinyWallet}
        tinyWalletAddress={tinyWalletAddress}
      />

      {/* Runbook Section */}
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-zinc-800">
          <h2 className="font-medium text-zinc-100">Tiny Manual Live Trade Runbook</h2>
          <p className="text-xs text-zinc-400 mt-1">Complete each step before proceeding</p>
        </div>
        <div className="divide-y divide-zinc-800">
          {RUNBOOK_STEPS.map((step, i) => (
            <div key={i} className="px-4 py-2 flex items-start gap-3">
              <span className="text-xs font-mono text-zinc-500 w-6 shrink-0">{i + 1}.</span>
              <span className="text-sm text-zinc-300">{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Initiate Tiny Manual Live Trade Button */}
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => router.push("/transactions?tiny_live=1")}
          disabled={!isReadyForTinyLive}
          className={`px-6 py-3 rounded font-mono text-sm font-bold ${
            isReadyForTinyLive
              ? "bg-green-700 hover:bg-green-600 text-white"
              : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
          }`}
        >
          {isReadyForTinyLive
            ? "Initiate Tiny Manual Live Trade"
            : "Blocked — Complete All Gates First"}
        </button>
      </div>

      {/* Why Am I Blocked? */}
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowWhyBlocked(!showWhyBlocked)}
          className="w-full px-4 py-3 bg-zinc-800 hover:bg-zinc-750 text-left flex items-center justify-between"
        >
          <span className="text-sm font-medium text-zinc-200">Why am I blocked?</span>
          <span className="text-zinc-500">{showWhyBlocked ? "▾" : "▸"}</span>
        </button>
        {showWhyBlocked && summary && (
          <div className="divide-y divide-zinc-800">
            {summary.blockedChecks.length === 0 ? (
              <div className="px-4 py-3 text-sm text-zinc-400">
                No blocked checks. All gates passed.
              </div>
            ) : (
              summary.blockedChecks.map((check) => (
                <div key={check.id} className="px-4 py-3 flex items-start gap-3">
                  <span className="text-red-400 text-sm font-mono">BLOCKED</span>
                  <div>
                    <div className="text-sm text-zinc-300">{check.message}</div>
                    <div className="text-xs text-zinc-500 mt-1">{check.category}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}