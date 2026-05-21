import type { CheckResult, CheckCategory, ReadinessContext } from "./readiness-types.js";

// =============================================================================
// Helper Functions
// =============================================================================

const pass = (
  id: number,
  category: string,
  name: string,
  ctx: ReadinessContext,
  evidence?: string,
): CheckResult => ({
  id,
  category: category as CheckCategory,
  name,
  status: "PASS",
  message: "OK",
  evidence: evidence ?? null,
});

const fail = (
  id: number,
  category: string,
  name: string,
  ctx: ReadinessContext,
  msg: string,
): CheckResult => ({
  id,
  category: category as CheckCategory,
  name,
  status: "FAIL",
  message: msg,
  evidence: null,
});

// =============================================================================
// Category 1: Core Gating (checks 1-4)
// =============================================================================

const check1_demoModeOff = (ctx: ReadinessContext): CheckResult => {
  if (ctx.isDemoMode === true) {
    return fail(1, "Core Gating", "demoModeOff", ctx, "Demo mode is enabled");
  }
  return pass(1, "Core Gating", "demoModeOff", ctx);
};

const check2_dryRunEnabled = (ctx: ReadinessContext): CheckResult => {
  if (ctx.isDryRunEnabled === false) {
    return fail(2, "Core Gating", "dryRunEnabled", ctx, "Dry-run mode is disabled");
  }
  return pass(2, "Core Gating", "dryRunEnabled", ctx);
};

const check3_vaultUnlocked = (ctx: ReadinessContext): CheckResult => {
  if (ctx.isVaultUnlocked === false) {
    return fail(3, "Core Gating", "vaultUnlocked", ctx, "Vault is locked");
  }
  return pass(3, "Core Gating", "vaultUnlocked", ctx);
};

const check4_emergencyPauseOff = (ctx: ReadinessContext): CheckResult => {
  if (ctx.isEmergencyPaused === true) {
    return fail(4, "Core Gating", "emergencyPauseOff", ctx, "Emergency pause is active");
  }
  return pass(4, "Core Gating", "emergencyPauseOff", ctx);
};

// =============================================================================
// Category 2: Registry & Risk (checks 5-9)
// =============================================================================

const check5_aggregateRiskEnabled = (ctx: ReadinessContext): CheckResult => {
  if (ctx.aggregateRiskEnabled === false) {
    return fail(5, "Registry & Risk", "aggregateRiskEnabled", ctx, "Aggregate risk is disabled");
  }
  return pass(5, "Registry & Risk", "aggregateRiskEnabled", ctx);
};

const check6_aggregateRiskUsdNormalized = (ctx: ReadinessContext): CheckResult => {
  if (ctx.aggregateRiskUsdNormalized === false) {
    return fail(6, "Registry & Risk", "aggregateRiskUsdNormalized", ctx, "Aggregate risk USD normalization is not configured");
  }
  return pass(6, "Registry & Risk", "aggregateRiskUsdNormalized", ctx);
};

const check7_tokenRecordsVerified = (ctx: ReadinessContext): CheckResult => {
  const unverified = ctx.tokens
    .filter((t) => t.enabled && t.verificationStatus !== "VERIFIED")
    .map((t) => t.symbol);

  if (unverified.length > 0) {
    return fail(
      7,
      "Registry & Risk",
      "tokenRecordsVerified",
      ctx,
      `Unverified tokens: ${unverified.join(", ")}`,
    );
  }
  return pass(7, "Registry & Risk", "tokenRecordsVerified", ctx);
};

const check8_routerRecordsVerified = (ctx: ReadinessContext): CheckResult => {
  const unverified = ctx.routers
    .filter((r) => r.enabled && r.verificationStatus !== "VERIFIED")
    .map((r) => r.name);

  if (unverified.length > 0) {
    return fail(
      8,
      "Registry & Risk",
      "routerRecordsVerified",
      ctx,
      `Unverified routers: ${unverified.join(", ")}`,
    );
  }
  return pass(8, "Registry & Risk", "routerRecordsVerified", ctx);
};

const check9_spenderRecordsVerified = (ctx: ReadinessContext): CheckResult => {
  const unverified = ctx.spenders
    .filter((s) => s.enabled && s.verificationStatus !== "VERIFIED")
    .map((s) => s.name);

  if (unverified.length > 0) {
    return fail(
      9,
      "Registry & Risk",
      "spenderRecordsVerified",
      ctx,
      `Unverified spenders: ${unverified.join(", ")}`,
    );
  }
  return pass(9, "Registry & Risk", "spenderRecordsVerified", ctx);
};

// =============================================================================
// Category 3: Artifacts & Drills (checks 10-16)
// =============================================================================

const check10_0xQuoteArtifact = (ctx: ReadinessContext): CheckResult => {
  const artifact = ctx.artifacts["0x_quote_validation"];
  if (!artifact) {
    return fail(
      10,
      "Artifacts & Drills",
      "0xQuoteArtifact",
      ctx,
      "No 0x quote validation artifact found. Run a dry-run quote and upload the result.",
    );
  }
  return pass(10, "Artifacts & Drills", "0xQuoteArtifact", ctx);
};

const check11_backupDrillArtifact = (ctx: ReadinessContext): CheckResult => {
  const artifact = ctx.artifacts["backup_restore_drill"];
  if (!artifact) {
    return fail(
      11,
      "Artifacts & Drills",
      "backupDrillArtifact",
      ctx,
      "No backup/restore drill artifact found. Complete the drill and upload the result.",
    );
  }
  return pass(11, "Artifacts & Drills", "backupDrillArtifact", ctx);
};

const check12_emergencyDrillArtifact = (ctx: ReadinessContext): CheckResult => {
  const artifact = ctx.artifacts["emergency_pause_drill"];
  if (!artifact) {
    return fail(
      12,
      "Artifacts & Drills",
      "emergencyDrillArtifact",
      ctx,
      "No emergency pause drill artifact found. Complete the drill and upload the result.",
    );
  }
  return pass(12, "Artifacts & Drills", "emergencyDrillArtifact", ctx);
};

const check13_dryRunLoadTestArtifact = (ctx: ReadinessContext): CheckResult => {
  const artifact = ctx.artifacts["dry_run_load_test"];
  if (!artifact) {
    return fail(
      13,
      "Artifacts & Drills",
      "dryRunLoadTestArtifact",
      ctx,
      "No dry-run load test artifact found.",
    );
  }
  return pass(13, "Artifacts & Drills", "dryRunLoadTestArtifact", ctx);
};

const check14_telegramTestArtifact = (ctx: ReadinessContext): CheckResult => {
  const artifact = ctx.artifacts["telegram_test"];
  if (!artifact) {
    return fail(
      14,
      "Artifacts & Drills",
      "telegramTestArtifact",
      ctx,
      "No Telegram test artifact found. Send a test alert and upload the result.",
    );
  }
  return pass(14, "Artifacts & Drills", "telegramTestArtifact", ctx);
};

const check15_e2eCiGreen = (ctx: ReadinessContext): CheckResult => {
  if (ctx.ciGreen === false) {
    return fail(15, "Artifacts & Drills", "e2eCiGreen", ctx, "E2E CI is not green");
  }
  return pass(15, "Artifacts & Drills", "e2eCiGreen", ctx);
};

const check16_metricsTokenConfigured = (ctx: ReadinessContext): CheckResult => {
  if (ctx.metricsTokenConfigured === false) {
    return fail(16, "Artifacts & Drills", "metricsTokenConfigured", ctx, "Metrics token is not configured");
  }
  return pass(16, "Artifacts & Drills", "metricsTokenConfigured", ctx);
};

// =============================================================================
// Category 4: Wallet Health (checks 17-19)
// =============================================================================

const check17_tinyWalletExists = (ctx: ReadinessContext): CheckResult => {
  if (ctx.tinyLiveWallet === null) {
    return fail(
      17,
      "Wallet Health",
      "tinyWalletExists",
      ctx,
      "No dedicated tiny live wallet found. Provision one via POST /api/readiness/tiny-wallet.",
    );
  }
  return pass(17, "Wallet Health", "tinyWalletExists", ctx);
};

const check18_tinyWalletPaused = (ctx: ReadinessContext): CheckResult => {
  if (!ctx.tinyLiveWallet) {
    return fail(18, "Wallet Health", "tinyWalletPaused", ctx, "No tiny wallet to check");
  }
  if (ctx.tinyLiveWallet.status !== "PAUSED") {
    return fail(
      18,
      "Wallet Health",
      "tinyWalletPaused",
      ctx,
      `Tiny wallet status is "${ctx.tinyLiveWallet.status}", expected "PAUSED"`,
    );
  }
  return pass(18, "Wallet Health", "tinyWalletPaused", ctx);
};

const check19_noStuckWallets = (ctx: ReadinessContext): CheckResult => {
  if (ctx.stuckOrDroppedWalletCount > 0) {
    return fail(
      19,
      "Wallet Health",
      "noStuckWallets",
      ctx,
      `${ctx.stuckOrDroppedWalletCount} stuck or dropped wallet(s) detected`,
    );
  }
  return pass(19, "Wallet Health", "noStuckWallets", ctx);
};

// =============================================================================
// Category 5: Scheduler & Custody (checks 20-23)
// =============================================================================

const check20_schedulerLiveDisabled = (ctx: ReadinessContext): CheckResult => {
  if (ctx.isLiveSchedulerEnabled === true) {
    return fail(
      20,
      "Scheduler & Custody",
      "schedulerLiveDisabled",
      ctx,
      "Live scheduler is enabled — HARD NO-GO",
    );
  }
  return pass(20, "Scheduler & Custody", "schedulerLiveDisabled", ctx);
};

const check21_custodyProviderHealthy = (ctx: ReadinessContext): CheckResult => {
  if (ctx.custodyProviderHealthy === false) {
    return fail(21, "Scheduler & Custody", "custodyProviderHealthy", ctx, "Custody provider is unhealthy");
  }
  return pass(21, "Scheduler & Custody", "custodyProviderHealthy", ctx);
};

const check22_exactApprovalFlowAvailable = (ctx: ReadinessContext): CheckResult => {
  if (ctx.exactApprovalFlowAvailable === false) {
    return fail(22, "Scheduler & Custody", "exactApprovalFlowAvailable", ctx, "Exact approval flow is not available");
  }
  return pass(22, "Scheduler & Custody", "exactApprovalFlowAvailable", ctx);
};

const check23_revokeFlowAvailable = (ctx: ReadinessContext): CheckResult => {
  if (ctx.revokeFlowAvailable === false) {
    return fail(23, "Scheduler & Custody", "revokeFlowAvailable", ctx, "Revoke flow is not available");
  }
  return pass(23, "Scheduler & Custody", "revokeFlowAvailable", ctx);
};

// =============================================================================
// Exports
// =============================================================================

const ALL_CHECKS = [
  check1_demoModeOff,
  check2_dryRunEnabled,
  check3_vaultUnlocked,
  check4_emergencyPauseOff,
  check5_aggregateRiskEnabled,
  check6_aggregateRiskUsdNormalized,
  check7_tokenRecordsVerified,
  check8_routerRecordsVerified,
  check9_spenderRecordsVerified,
  check10_0xQuoteArtifact,
  check11_backupDrillArtifact,
  check12_emergencyDrillArtifact,
  check13_dryRunLoadTestArtifact,
  check14_telegramTestArtifact,
  check15_e2eCiGreen,
  check16_metricsTokenConfigured,
  check17_tinyWalletExists,
  check18_tinyWalletPaused,
  check19_noStuckWallets,
  check20_schedulerLiveDisabled,
  check21_custodyProviderHealthy,
  check22_exactApprovalFlowAvailable,
  check23_revokeFlowAvailable,
];

export { ALL_CHECKS };