# Live Readiness Real Gates — Design Spec

**Date:** 2026-05-22
**Status:** Approved

---

## 1. Overview

Turn the Live Readiness Center from a checklist with no-op checks into a real, source-of-truth gate system. Every check must read actual runtime or config state. Unknown evidence must block readiness. Live scheduler remains disabled — but its status must be detected correctly.

---

## 2. Enriched Artifact Model

### Interface Change (`readiness-types.ts`)

```typescript
interface Artifact {
  type: ArtifactType;
  passed: boolean;
  evidence: string | null;      // URL or file path to drill result
  notes: string | null;
  createdAt: string;              // ISO datetime
  createdBy: string;              // operator username
  expiresAt: string | null;      // ISO datetime; null = never expires
  checksum: string | null;        // SHA-256 of artifact file content
  filePath: string | null;        // absolute path to stored artifact file
}
```

### Storage

File-based storage in `.readiness/artifacts/<type>_<timestamp>.json`. No DB table. Artifacts persist across server restarts.

### Expiration Enforcement

Checks 10–14 (artifact checks) fail not only when artifact is missing, but also when `expiresAt` is set and `Date.now() > new Date(expiresAt)`. The `loadLatestArtifact` in `readiness-artifacts.ts` is updated to return `null` for expired artifacts, triggering FAIL.

### `storeArtifact` Enhancement

```typescript
import { createHash } from "node:crypto";

export async function storeArtifact(artifact: Artifact): Promise<string> {
  await ensureDir();
  const filename = `${artifact.type}_${Date.now()}.json`;
  const filePath = join(ARTIFACTS_DIR, filename);

  // Compute checksum of content
  const content = JSON.stringify(artifact, null, 2);
  const checksum = createHash("sha256").update(content).digest("hex");

  // Attach computed fields
  const stored: Artifact = {
    ...artifact,
    checksum,
    filePath,
  };

  await writeFile(filePath, content, "utf-8");
  return filename;
}
```

---

## 3. No-Op Checks → Real Evidence

### Checks 20–23: Before vs After

| Check | Field | Old Value | New Real Source | Pass | Fail/Blocked |
|-------|-------|-----------|-----------------|------|--------------|
| 20 `schedulerLiveDisabled` | `isLiveSchedulerEnabled` | `false` hardcoded | `getRuntimeConfig().schedulerLiveExecution` | `false` | `true` → `LIVE_AUTOMATION_HARD_NO_GO` |
| 21 `custodyProviderHealthy` | `custodyProviderHealthy` | `true` hardcoded | `getActiveCustodyProvider().isHealthy()` | `true` | `false` or throws → BLOCKED |
| 22 `exactApprovalFlowAvailable` | `exactApprovalFlowAvailable` | `true` hardcoded | `getActiveCustodyProvider().isFeatureSupported('exact_approval')` | `true` | `false` or throws → BLOCKED |
| 23 `revokeFlowAvailable` | `revokeFlowAvailable` | `true` hardcoded | `getActiveCustodyProvider().isFeatureSupported('revoke')` | `true` | `false` or throws → BLOCKED |

### New `BLOCKED` Status

A third status `BLOCKED` is added alongside `PASS` and `FAIL`. BLOCKED means the evidence source was unreachable — not a failure, but cannot determine. BLOCKED blocks readiness same as FAIL, but with distinct messaging.

```typescript
type CheckStatus = "PASS" | "FAIL" | "BLOCKED";

interface CheckResult {
  id: number;
  category: CheckCategory;
  name: string;
  status: CheckStatus;
  message: string;
  evidence: string | null;
}
```

### `ciGreen` Fix

Old: `ciGreen: !process.env.CI_STATUS_URL` (inverted — no URL = green)
New: `ciGreen: false` always, since no CI green signal artifact is configured in this repo.

---

## 4. `buildContext` Implementation

```typescript
import { getRuntimeConfig } from "../config/runtime-config.js";
import { getActiveCustodyProvider } from "../custody/providers/registry.js";

// ...

isLiveSchedulerEnabled: getRuntimeConfig().schedulerLiveExecution,

custodyProviderHealthy: (() => {
  try {
    return getActiveCustodyProvider().isHealthy();
  } catch {
    return false; // signals BLOCKED via UNKNOWN below
  }
})(),

exactApprovalFlowAvailable: (() => {
  try {
    return getActiveCustodyProvider().isFeatureSupported("exact_approval");
  } catch {
    return false;
  }
})(),

revokeFlowAvailable: (() => {
  try {
    return getActiveCustodyProvider().isFeatureSupported("revoke");
  } catch {
    return false;
  }
})(),

ciGreen: false,
```

The custody provider calls are placed inside IIFEs so that a provider that throws during `isHealthy()` still produces a `false` value — which the check functions will then treat as BLOCKED.

### Check Functions Updated

Each check function gets a `blocked` helper:

```typescript
const blocked = (
  id: number,
  category: string,
  name: string,
  ctx: ReadinessContext,
  msg: string,
): CheckResult => ({
  id,
  category: category as CheckCategory,
  name,
  status: "BLOCKED",
  message: msg,
  evidence: null,
});
```

Check 21: `ctx.custodyProviderHealthy === false` → FAIL. If provider is unreachable (ctx value is `false` from IIFE catch), message says "unreachable". Check 22 and 23 similarly.

---

## 5. `computeState` — Live Scheduler Override

```typescript
export function computeState(results: CheckResult[]): ReadinessState {
  const failedIds = results.filter((r) => r.status === "FAIL").map((r) => r.id);
  const blockedIds = results.filter((r) => r.status === "BLOCKED").map((r) => r.id);
  const allBlocking = [...failedIds, ...blockedIds];

  // HARD OVERRIDE: check 20 (scheduler live enabled) is the top safety gate.
  // If live scheduler is unexpectedly enabled, immediately return NO-GO.
  // This overrides all other checks — even if everything else passes.
  if (allBlocking.includes(20)) {
    return "LIVE_AUTOMATION_HARD_NO_GO";
  }

  // Cascade: per-gate progression
  if (allBlocking.includes(1)) return "DEMO_READY";
  if (allBlocking.includes(2)) return "DRY_RUN_READY";
  if ([3, 4].some((id) => allBlocking.includes(id))) return "DRY_RUN_READY";
  if ([5, 6, 7, 8, 9].some((id) => allBlocking.includes(id))) return "DRY_RUN_READY";

  const checks1to16Pass = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].every(
    (id) => !allBlocking.includes(id)
  );
  const checks17to23Pass = [17,18,19,20,21,22,23].every(
    (id) => !allBlocking.includes(id)
  );

  if (checks1to16Pass && checks17to23Pass)
    return "TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW";
  return "TINY_MANUAL_LIVE_BLOCKED";
}
```

`LIVE_AUTOMATION_HARD_NO_GO` is now an active reachable state in the state machine.

---

## 6. Artifact Expiration Check

In `check10_0xQuoteArtifact` through `check14_telegramTestArtifact`:

```typescript
const check10_0xQuoteArtifact = (ctx: ReadinessContext): CheckResult => {
  const artifact = ctx.artifacts["0x_quote_validation"];
  if (!artifact) {
    return fail(10, "Artifacts & Drills", "0xQuoteArtifact", ctx,
      "No 0x quote validation artifact found. Run a dry-run quote and upload the result.");
  }
  if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) {
    return fail(10, "Artifacts & Drills", "0xQuoteArtifact", ctx,
      `Artifact expired at ${artifact.expiresAt}. Re-run the drill and upload a fresh result.`);
  }
  return pass(10, "Artifacts & Drills", "0xQuoteArtifact", ctx);
};
```

Same pattern for checks 11, 12, 13, 14.

---

## 7. New Readiness Routes

### POST /api/readiness/artifacts — Add `expiresAt` field

The upload schema gains an optional `expiresAt` ISO datetime field. If omitted, artifact never expires.

```typescript
const artifactUploadSchema = z.object({
  type: z.enum([...]),
  passed: z.boolean(),
  evidence: z.string().url().nullable(),
  notes: z.string().nullable(),
  expiresAt: z.string().datetime().nullable().optional(), // new
});
```

---

## 8. New Tests

Nine new tests in `readiness.test.ts`:

| # | Test | Expected |
|---|------|----------|
| 1 | `ctx.artifacts["0x_quote_validation"] = null` | check10 FAIL |
| 2 | `artifact.expiresAt = past date` | check10 FAIL with "expired" message |
| 3 | `isLiveSchedulerEnabled: true` in ctx | check20 FAIL, message contains "HARD NO-GO" |
| 4 | `isLiveSchedulerEnabled: true` + all other checks pass | `computeState` → `LIVE_AUTOMATION_HARD_NO_GO` (override works) |
| 5 | `custodyProviderHealthy: false` via IIFE catch | check21 FAIL with "unreachable" message |
| 6 | `exactApprovalFlowAvailable: false` | check22 FAIL |
| 7 | `revokeFlowAvailable: false` | check23 FAIL |
| 8 | result with BLOCKED status | `computeState` treats BLOCKED same as FAIL |
| 9 | `getReadinessSummary` with BLOCKED check | blockedChecks includes BLOCKED reasons |

---

## 9. Files to Change

| File | Change |
|------|--------|
| `readiness-types.ts` | Add `expiresAt`, `checksum`, `filePath` to `Artifact`; add `BLOCKED` to `CheckStatus` |
| `readiness-checks.ts` | Add `blocked()` helper; check 20 reads real `isLiveSchedulerEnabled`; checks 21–23 handle BLOCKED; artifact checks enforce expiration |
| `readiness-service.ts` | `buildContext` calls `getRuntimeConfig()` and custody provider; `computeState` has live scheduler override |
| `readiness-artifacts.ts` | `storeArtifact` adds checksum + filePath; `loadLatestArtifact` filters expired |
| `readiness-routes.ts` | Upload schema gains `expiresAt` field |
| `readiness.test.ts` | 9 new tests |
| `docs/LIVE_READINESS_CENTER.md` | Update with BLOCKED status, artifact expiration, real scheduler detection |
| `docs/NO_GO_CONDITIONS.md` | Update with BLOCKED = unknown blocks, check 20 override |
| `docs/TINY_MANUAL_LIVE_TEST_RUNBOOK.md` | Update |
| `docs/READINESS_ARTIFACTS.md` | New — artifact types, schema, expiration rules |
| `report_final_closeout/03_READINESS_REAL_GATES_REPORT.md` | New |

---

## 10. Out of Scope

- `LIMITED_LIVE_CANARY_READY` state — future phase
- Execute-once gate enforcement (MFA, RBAC, typed confirmation) — already handled in `trade-routes.ts`
- DB-backed artifact storage — file-based is sufficient and already implemented
- Live scheduler enablement — scheduler stays disabled; we only detect its state