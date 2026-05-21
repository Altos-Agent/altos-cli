import { describe, expect, it } from "vitest";
import type { ReadinessContext } from "./readiness-types.js";
import {
  check7_tokenRecordsVerified,
  check8_routerRecordsVerified,
  check11_backupDrillArtifact,
  check12_emergencyDrillArtifact,
  check20_schedulerLiveDisabled,
  ALL_CHECKS,
} from "./readiness-checks.js";
import { computeState } from "./readiness-service.js";

const makeCtx = (overrides: Partial<ReadinessContext> = {}): ReadinessContext => ({
  db: {} as any,
  isDemoMode: false,
  isDryRunEnabled: true,
  isVaultUnlocked: true,
  isEmergencyPaused: false,
  aggregateRiskEnabled: true,
  aggregateRiskUsdNormalized: true,
  tokens: [],
  routers: [],
  spenders: [],
  tinyLiveWallet: { id: "x", address: "0xABC", status: "PAUSED" },
  stuckOrDroppedWalletCount: 0,
  isLiveSchedulerEnabled: false,
  custodyProviderHealthy: true,
  exactApprovalFlowAvailable: true,
  revokeFlowAvailable: true,
  artifacts: {},
  ciGreen: true,
  metricsTokenConfigured: true,
  ...overrides,
} as ReadinessContext);

describe("readiness checks", () => {
  describe("check7_tokenRecordsVerified", () => {
    it("PASS when all enabled tokens are verified", () => {
      const ctx = makeCtx({
        tokens: [
          { id: "1", symbol: "ETH", verificationStatus: "VERIFIED", enabled: true },
        ],
      });
      const result = check7_tokenRecordsVerified(ctx);
      expect(result.status).toBe("PASS");
    });

    it("FAIL when an enabled token is not verified", () => {
      const ctx = makeCtx({
        tokens: [
          { id: "1", symbol: "ETH", verificationStatus: "VERIFIED", enabled: true },
          { id: "2", symbol: "USDC", verificationStatus: "UNVERIFIED", enabled: true },
        ],
      });
      const result = check7_tokenRecordsVerified(ctx);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("USDC");
    });
  });

  describe("check8_routerRecordsVerified", () => {
    it("FAIL when an active router is not verified", () => {
      const ctx = makeCtx({
        routers: [
          { id: "1", name: "Router1", verificationStatus: "UNVERIFIED", enabled: true },
        ],
      });
      const result = check8_routerRecordsVerified(ctx);
      expect(result.status).toBe("FAIL");
    });
  });

  describe("check11_backupDrillArtifact", () => {
    it("FAIL when no backup drill artifact exists", () => {
      const ctx = makeCtx({ artifacts: {} });
      const result = check11_backupDrillArtifact(ctx);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("No backup/restore drill artifact");
    });
  });

  describe("check12_emergencyDrillArtifact", () => {
    it("FAIL when no emergency drill artifact exists", () => {
      const ctx = makeCtx({ artifacts: {} });
      const result = check12_emergencyDrillArtifact(ctx);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("No emergency pause drill artifact");
    });
  });

  describe("check20_schedulerLiveDisabled", () => {
    it("FAIL when live scheduler is enabled", () => {
      const ctx = makeCtx({ isLiveSchedulerEnabled: true });
      const result = check20_schedulerLiveDisabled(ctx);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("HARD NO-GO");
    });
  });

  describe("computeState", () => {
    it("returns TINY_MANUAL_LIVE_BLOCKED when tiny wallet missing", () => {
      const ctx = makeCtx({
        tinyLiveWallet: null,
        artifacts: {
          "0x_quote_validation": {
            type: "0x_quote_validation",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
          },
          backup_restore_drill: {
            type: "backup_restore_drill",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
          },
          emergency_pause_drill: {
            type: "emergency_pause_drill",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
          },
          dry_run_load_test: {
            type: "dry_run_load_test",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
          },
          telegram_test: {
            type: "telegram_test",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
          },
        },
      });
      const results = ALL_CHECKS.map((c) => c(ctx));
      const state = computeState(results);
      expect(state).toBe("TINY_MANUAL_LIVE_BLOCKED");
    });
  });
});