import type { DbClient } from "../db/client.js";
import type { ScheduleOccurrence } from "../db/schema.js";
import { assertGlobalEmergencyNotPaused } from "../security/emergency-pause.js";
import { reserveAggregateRisk } from "./aggregate-risk-reservations.js";
import { acquireWalletLockAtomic } from "./wallet-lock-atomic.js";

export interface BlockedReason {
  gate: string;
  code: string;
  message: string;
}

export interface PreSignGateResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
  evaluatedAt: Date;
}

export const readinessCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until readiness system is wired
  return {
    passed: false,
    code: "READINESS_NOT_CONFIGURED",
    message: "Readiness system not yet wired — cannot execute LIVE_CANARY",
  };
};

export const rbacReauthMfaCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until RBAC + re-auth + MFA proof wired
  return {
    passed: false,
    code: "RBAC_REAUTH_NOT_CONFIGURED",
    message: "RBAC/re-auth/MFA not yet wired — cannot execute LIVE_CANARY",
  };
};

export const signerPolicyCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until per-wallet signer policy check wired
  return {
    passed: false,
    code: "SIGNER_POLICY_NOT_CONFIGURED",
    message: "Signer policy engine not yet wired — cannot execute LIVE_CANARY",
  };
};

export const verifiedRegistryCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until token/pair/router verified registry wired
  return {
    passed: false,
    code: "VERIFIED_REGISTRY_NOT_CONFIGURED",
    message: "Verified registry not yet wired — cannot execute LIVE_CANARY",
  };
};

export const aggregateRiskReservationCheck = async (
  occurrence: ScheduleOccurrence,
  db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  try {
    await reserveAggregateRisk(db, {
      traceId: occurrence.traceId ?? occurrence.id,
      walletId: occurrence.walletId,
      pairId: occurrence.pairId,
      occurrenceId: occurrence.id,
      amountUsd: 0,
      gasUsd: 0,
    });
    return { passed: true };
  } catch (err) {
    return {
      passed: false,
      code: "AGGREGATE_RISK_RESERVATION_FAILED",
      message: err instanceof Error ? err.message : "Risk reservation failed",
    };
  }
};

export const nonceReservationCheck = async (
  occurrence: ScheduleOccurrence,
  db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  try {
    await acquireWalletLockAtomic(db, {
      walletId: occurrence.walletId,
      requestId: occurrence.requestId ?? occurrence.id,
      occurrenceId: occurrence.id,
      traceId: occurrence.traceId ?? null,
      lockReason: "SCHEDULER_TRADE",
      finalityRequired: false,
    });
    return { passed: true };
  } catch (err) {
    return {
      passed: false,
      code: "NONCE_RESERVATION_FAILED",
      message: err instanceof Error ? err.message : "Nonce reservation failed",
    };
  }
};

export const quoteValidationCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  return {
    passed: false,
    code: "QUOTE_VALIDATION_NOT_CONFIGURED",
    message: "Quote validation not yet wired — cannot execute LIVE_CANARY",
  };
};

export const simulationCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  return {
    passed: false,
    code: "SIMULATION_NOT_CONFIGURED",
    message: "Simulation not yet wired — cannot execute LIVE_CANARY",
  };
};

export const emergencyPauseCheck = async (
  _occurrence: ScheduleOccurrence,
  db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  try {
    await assertGlobalEmergencyNotPaused(db);
    return { passed: true };
  } catch {
    return {
      passed: false,
      code: "EMERGENCY_PAUSE_ACTIVE",
      message: "Global emergency pause is active",
    };
  }
};

export async function evaluatePreSignGates(
  occurrence: ScheduleOccurrence,
  db: DbClient
): Promise<PreSignGateResult> {
  const evaluatedAt = new Date();

  if (occurrence.mode === "LIVE") {
    return {
      allowed: false,
      blockedReasons: [{
        gate: "liveModeCheck",
        code: "LIVE_MODE_BLOCKED",
        message: "Live scheduled execution is not implemented",
      }],
      evaluatedAt,
    };
  }

  if (occurrence.mode === "DRY_RUN") {
    return { allowed: true, blockedReasons: [], evaluatedAt };
  }

  // LIVE_CANARY: evaluate all gates
  const blockedReasons: BlockedReason[] = [];
  const gates = [
    { name: "readinessCheck", fn: readinessCheck },
    { name: "rbacReauthMfaCheck", fn: rbacReauthMfaCheck },
    { name: "signerPolicyCheck", fn: signerPolicyCheck },
    { name: "verifiedRegistryCheck", fn: verifiedRegistryCheck },
    { name: "aggregateRiskReservationCheck", fn: aggregateRiskReservationCheck },
    { name: "nonceReservationCheck", fn: nonceReservationCheck },
    { name: "quoteValidationCheck", fn: quoteValidationCheck },
    { name: "simulationCheck", fn: simulationCheck },
    { name: "emergencyPauseCheck", fn: emergencyPauseCheck },
  ];

  for (const { name, fn } of gates) {
    const result = await fn(occurrence, db);
    if (!result.passed) {
      blockedReasons.push({
        gate: name,
        code: result.code ?? "UNKNOWN_GATE_FAILURE",
        message: result.message ?? "Gate check failed",
      });
    }
  }

  return { allowed: blockedReasons.length === 0, blockedReasons, evaluatedAt };
}