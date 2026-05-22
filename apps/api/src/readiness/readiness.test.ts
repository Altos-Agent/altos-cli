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
            expiresAt: null,
            checksum: null,
            filePath: null,
          },
          backup_restore_drill: {
            type: "backup_restore_drill",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
            expiresAt: null,
            checksum: null,
            filePath: null,
          },
          emergency_pause_drill: {
            type: "emergency_pause_drill",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
            expiresAt: null,
            checksum: null,
            filePath: null,
          },
          dry_run_load_test: {
            type: "dry_run_load_test",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
            expiresAt: null,
            checksum: null,
            filePath: null,
          },
          telegram_test: {
            type: "telegram_test",
            passed: true,
            evidence: "http://x.com",
            notes: null,
            createdAt: "",
            createdBy: "op",
            expiresAt: null,
            checksum: null,
            filePath: null,
          },
        },
      });
      const results = ALL_CHECKS.map((c) => c(ctx));
      const state = computeState(results);
      expect(state).toBe("TINY_MANUAL_LIVE_BLOCKED");
    });
  });

  describe("check10_0xQuoteArtifact expiration", () => {
    it("FAIL when artifact is missing", () => {
      const ctx = makeCtx({ artifacts: {} });
      const result = ALL_CHECKS[9](ctx); // check10 is index 9
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("No 0x quote validation artifact");
    });

    it("FAIL when artifact has expired", () => {
      const ctx = makeCtx({
        artifacts: {
          "0x_quote_validation": {
            type: "0x_quote_validation",
            passed: true,
            evidence: "http://example.com/result",
            notes: null,
            createdAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
            createdBy: "test",
            expiresAt: new Date(Date.now() - 86400000).toISOString(), // expired 1 day ago
            checksum: null,
            filePath: null,
          },
        },
      });
      const result = ALL_CHECKS[9](ctx);
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("expired");
    });
  });

  describe("check20_schedulerLiveDisabled", () => {
    it("FAIL when isLiveSchedulerEnabled is true", () => {
      const ctx = makeCtx({ isLiveSchedulerEnabled: true });
      const result = ALL_CHECKS[19](ctx); // check20 is index 19
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("HARD NO-GO");
    });

    it("PASS when isLiveSchedulerEnabled is false", () => {
      const ctx = makeCtx({ isLiveSchedulerEnabled: false });
      const result = ALL_CHECKS[19](ctx);
      expect(result.status).toBe("PASS");
    });
  });

  describe("computeState with LIVE_AUTOMATION_HARD_NO_GO", () => {
    it("returns LIVE_AUTOMATION_HARD_NO_GO when check 20 fails (live scheduler enabled)", () => {
      // All other checks pass, but check 20 fails → should return HARD_NO_GO
      const ctx = makeCtx({
        isLiveSchedulerEnabled: true,
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
        custodyProviderHealthy: true,
        exactApprovalFlowAvailable: true,
        revokeFlowAvailable: true,
        artifacts: {
          "0x_quote_validation": {
            type: "0x_quote_validation", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          backup_restore_drill: {
            type: "backup_restore_drill", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          emergency_pause_drill: {
            type: "emergency_pause_drill", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          dry_run_load_test: {
            type: "dry_run_load_test", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          telegram_test: {
            type: "telegram_test", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
        },
        ciGreen: true,
        metricsTokenConfigured: true,
      });
      const results = ALL_CHECKS.map((c) => c(ctx));
      const state = computeState(results);
      expect(state).toBe("LIVE_AUTOMATION_HARD_NO_GO");
    });
  });

  describe("check21_custodyProviderHealthy", () => {
    it("BLOCKED when custodyProviderHealthy is false (provider unreachable)", () => {
      const ctx = makeCtx({ custodyProviderHealthy: false });
      const result = ALL_CHECKS[20](ctx); // check21 is index 20
      expect(result.status).toBe("BLOCKED");
      expect(result.message).toContain("unreachable");
    });

    it("PASS when custodyProviderHealthy is true", () => {
      const ctx = makeCtx({ custodyProviderHealthy: true });
      const result = ALL_CHECKS[20](ctx);
      expect(result.status).toBe("PASS");
    });
  });

  describe("check22_exactApprovalFlowAvailable", () => {
    it("FAIL when exactApprovalFlowAvailable is false", () => {
      const ctx = makeCtx({ exactApprovalFlowAvailable: false });
      const result = ALL_CHECKS[21](ctx); // check22 is index 21
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("not available");
    });
  });

  describe("check23_revokeFlowAvailable", () => {
    it("FAIL when revokeFlowAvailable is false", () => {
      const ctx = makeCtx({ revokeFlowAvailable: false });
      const result = ALL_CHECKS[22](ctx); // check23 is index 22
      expect(result.status).toBe("FAIL");
      expect(result.message).toContain("not available");
    });
  });

  describe("computeState treats BLOCKED same as FAIL", () => {
    it("TINY_MANUAL_LIVE_BLOCKED when check21 returns BLOCKED", () => {
      const ctx = makeCtx({
        custodyProviderHealthy: false,
        artifacts: {
          "0x_quote_validation": {
            type: "0x_quote_validation", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          backup_restore_drill: {
            type: "backup_restore_drill", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          emergency_pause_drill: {
            type: "emergency_pause_drill", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          dry_run_load_test: {
            type: "dry_run_load_test", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
          telegram_test: {
            type: "telegram_test", passed: true, evidence: "http://x.com",
            notes: null, createdAt: "", createdBy: "op",
            expiresAt: null, checksum: null, filePath: null,
          },
        },
      });
      const results = ALL_CHECKS.map((c) => c(ctx));
      const state = computeState(results);
      expect(state).toBe("TINY_MANUAL_LIVE_BLOCKED");
    });
  });
});