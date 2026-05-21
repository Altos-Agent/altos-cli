import type { DbClient } from "../db/client.js";

// =============================================================================
// Readiness State Types
// =============================================================================

const READINESS_STATES = [
  "DEMO_READY",
  "DRY_RUN_READY",
  "MULTI_WALLET_DRY_RUN_READY",
  "TINY_MANUAL_LIVE_BLOCKED",
  "TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW",
  "LIVE_AUTOMATION_HARD_NO_GO",
  "LIVE_AUTOMATION_READY",
] as const;

type ReadinessState = (typeof READINESS_STATES)[number];

// =============================================================================
// Check Category Types
// =============================================================================

const CHECK_CATEGORIES = [
  "Core Gating",
  "Registry & Risk",
  "Artifacts & Drills",
  "Wallet Health",
  "Scheduler & Custody",
] as const;

type CheckCategory = (typeof CHECK_CATEGORIES)[number];

// =============================================================================
// Check Result Types
// =============================================================================

type CheckStatus = "PASS" | "FAIL" | "BLOCKED";

interface CheckResult {
  id: number;
  category: CheckCategory;
  name: string;
  status: CheckStatus;
  message: string;
  evidence: string | null;
}

// =============================================================================
// Artifact Types
// =============================================================================

type ArtifactType =
  | "0x_quote_validation"
  | "backup_restore_drill"
  | "emergency_pause_drill"
  | "dry_run_load_test"
  | "telegram_test"
  | "tiny_live_operator_checklist";

interface Artifact {
  type: ArtifactType;
  passed: boolean;
  evidence: string | null;
  notes: string | null;
  createdAt: string; // ISO datetime
  createdBy: string;
}

// =============================================================================
// Readiness Result Types
// =============================================================================

interface ReadinessSummary {
  state: ReadinessState;
  liveAutomationHardNoGo: boolean;
  liveAutomationReady: false; // always false, reserved for future
  blockedChecks: Pick<CheckResult, "id" | "message" | "category">[];
  passedCheckIds: number[];
  lastCheckedAt: string | null; // ISO datetime
}

interface ReadinessDetailedResult {
  state: ReadinessState;
  checks: CheckResult[];
  ranAt: string; // ISO datetime
}

// =============================================================================
// Readiness Context Types
// =============================================================================

interface ReadinessContext {
  db: DbClient;
  isDemoMode: boolean;
  isDryRunEnabled: boolean;
  isVaultUnlocked: boolean;
  isEmergencyPaused: boolean;
  aggregateRiskEnabled: boolean;
  aggregateRiskUsdNormalized: boolean;
  tokens: Array<{
    id: string;
    symbol: string;
    verificationStatus: string;
    enabled: boolean;
  }>;
  routers: Array<{
    id: string;
    name: string;
    verificationStatus: string;
    enabled: boolean;
  }>;
  spenders: Array<{
    id: string;
    name: string;
    verificationStatus: string;
    enabled: boolean;
  }>;
  tinyLiveWallet: { id: string; address: string; status: string } | null;
  stuckOrDroppedWalletCount: number;
  isLiveSchedulerEnabled: boolean;
  custodyProviderHealthy: boolean;
  exactApprovalFlowAvailable: boolean;
  revokeFlowAvailable: boolean;
  artifacts: Partial<Record<ArtifactType, Artifact | null>>;
  ciGreen: boolean;
  metricsTokenConfigured: boolean;
}

// =============================================================================
// Exports
// =============================================================================

export {
  READINESS_STATES,
  CHECK_CATEGORIES,
  type ReadinessState,
  type CheckCategory,
  type CheckStatus,
  type CheckResult,
  type ArtifactType,
  type Artifact,
  type ReadinessSummary,
  type ReadinessDetailedResult,
  type ReadinessContext,
};
