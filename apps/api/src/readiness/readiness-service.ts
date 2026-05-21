import type { DbClient } from "../db/client.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { isDemoMode, isDryRunEnabled } from "../runtime/mode.js";
import { isGlobalEmergencyPaused } from "../security/emergency-pause.js";
import { getAggregateLimits } from "../risk/aggregate-risk.js";
import { getVaultStatus } from "../vault/vault-lock.js";
import { tokens, routers, wallets, transactions } from "../db/schema.js";
import { eq, or } from "drizzle-orm";
import { loadAllArtifacts } from "./readiness-artifacts.js";
import { ALL_CHECKS } from "./readiness-checks.js";
import type {
  ReadinessContext,
  ReadinessState,
  CheckResult,
  ReadinessSummary,
  ReadinessDetailedResult,
} from "./readiness-types.js";
import {
  getReadinessState,
  setReadinessState,
  setLastCheckResults,
  setLastCheckedAt,
  getLastCheckResults,
  getLastCheckedAt,
} from "./readiness-state.js";

// =============================================================================
// buildContext
// =============================================================================

async function buildContext(db: DbClient): Promise<ReadinessContext> {
  const isVaultUnlocked = getVaultStatus().status === "UNLOCKED";
  const isEmergencyPaused = await isGlobalEmergencyPaused(db);

  const limits = await getAggregateLimits(db);
  const aggregateRiskEnabled = limits?.enabled ?? false;
  const aggregateRiskUsdNormalized =
    aggregateRiskEnabled && parseFloat(limits?.maxDailyTradeUsd ?? "0") > 0;

  // Query enabled tokens
  const tokenRows = await db
    .select({
      id: tokens.id,
      symbol: tokens.symbol,
      verificationStatus: tokens.verificationStatus,
      enabled: tokens.enabled,
    })
    .from(tokens)
    .where(eq(tokens.enabled, true));

  // Query enabled routers
  const routerRows = await db
    .select({
      id: routers.id,
      name: routers.name,
      verificationStatus: routers.verificationStatus,
      enabled: routers.enabled,
    })
    .from(routers)
    .where(eq(routers.enabled, true));

  // Spenders are routers that have a spenderAddress set
  const spenders = routerRows
    .filter((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spenderAddress = (r as any).spenderAddress;
      return spenderAddress != null && spenderAddress !== "";
    })
    .map((r) => ({
      id: r.id,
      name: r.name,
      verificationStatus: r.verificationStatus,
      enabled: r.enabled,
    }));

  // Find TINY_LIVE wallet
  const allWallets = await db.select().from(wallets);
  const tinyLiveWalletArr = allWallets.filter((w) => (w.name ?? "").includes("TINY_LIVE"));
  const tinyLiveWallet =
    tinyLiveWalletArr.length > 0
      ? {
          id: tinyLiveWalletArr[0]!.id,
          address: tinyLiveWalletArr[0]!.address,
          status: tinyLiveWalletArr[0]!.status,
        }
      : null;

  // Count stuck or dropped wallets via transactions table
  const stuckTxs = await db.select().from(transactions).where(
    or(eq(transactions.status, "FAILED"), eq(transactions.status, "DROPPED"))
  );
  const stuckOrDroppedWalletCount = stuckTxs.length;

  const artifacts = await loadAllArtifacts();

  return {
    db,
    isDemoMode: isDemoMode(),
    isDryRunEnabled: isDryRunEnabled(),
    isVaultUnlocked,
    isEmergencyPaused,
    aggregateRiskEnabled,
    aggregateRiskUsdNormalized,
    tokens: tokenRows,
    routers: routerRows,
    spenders,
    tinyLiveWallet,
    stuckOrDroppedWalletCount,
    isLiveSchedulerEnabled: false,
    custodyProviderHealthy: true,
    exactApprovalFlowAvailable: true,
    revokeFlowAvailable: true,
    artifacts,
    ciGreen: !process.env.CI_STATUS_URL,
    metricsTokenConfigured: Boolean(process.env.METRICS_TOKEN),
  };
}

// =============================================================================
// computeState
// =============================================================================

export function computeState(results: CheckResult[]): ReadinessState {
  const failedIds = results.filter((r) => r.status === "FAIL").map((r) => r.id);

  if (failedIds.includes(1)) return "DEMO_READY";
  if (failedIds.includes(2)) return "DRY_RUN_READY";
  if ([3, 4].some((id) => failedIds.includes(id))) return "DRY_RUN_READY";
  if ([5, 6, 7, 8, 9].some((id) => failedIds.includes(id))) return "DRY_RUN_READY";

  const checks1to16Pass = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].every(
    (id) => !failedIds.includes(id)
  );
  const checks17to23Pass = [17, 18, 19, 20, 21, 22, 23].every(
    (id) => !failedIds.includes(id)
  );

  if (checks1to16Pass && checks17to23Pass)
    return "TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW";
  return "TINY_MANUAL_LIVE_BLOCKED";
}

// =============================================================================
// runReadinessChecks
// =============================================================================

export async function runReadinessChecks(
  db: DbClient
): Promise<ReadinessDetailedResult> {
  const ctx = await buildContext(db);
  const results = ALL_CHECKS.map((check) => check(ctx));
  const state = computeState(results);

  setReadinessState(state);
  setLastCheckResults(results);
  setLastCheckedAt(new Date().toISOString());

  return {
    state,
    checks: results,
    ranAt: new Date().toISOString(),
  };
}

// =============================================================================
// getReadinessSummary
// =============================================================================

export async function getReadinessSummary(
  _db: DbClient
): Promise<ReadinessSummary> {
  const state = getReadinessState();
  const lastResults = getLastCheckResults();
  const lastCheckedAt = getLastCheckedAt();

  const blockedChecks = lastResults
    .filter((r) => r.status === "FAIL")
    .map((r) => ({ id: r.id, message: r.message, category: r.category }));

  const passedCheckIds = lastResults
    .filter((r) => r.status === "PASS")
    .map((r) => r.id);

  return {
    state,
    liveAutomationHardNoGo: false,
    liveAutomationReady: false,
    blockedChecks,
    passedCheckIds,
    lastCheckedAt,
  };
}