# Live Readiness Center

## Overview

The Live Readiness Center definitively answers whether the system is ready for one tiny, operator-reviewed live execute-once trade using a dedicated low-value wallet.

**Important:** This is NOT live automation. The live scheduler remains disabled. This center only gates a single, tiny, manual live test.

## Check Statuses

Each of the 23 readiness checks returns one of three statuses:

| Status | Meaning | Blocks Readiness? |
|--------|---------|-------------------|
| `PASS` | Check passed; evidence available and valid | No |
| `FAIL` | Check failed; criteria not met | Yes |
| `BLOCKED` | Evidence source was unreachable; cannot determine status | Yes (same as FAIL) |

**BLOCKED** means the system could not reach the evidence source (e.g., custody provider health endpoint, live scheduler config). Because the evidence cannot be verified, BLOCKED is treated as a readiness blocker the same as FAIL. All 23 checks must return PASS for the system to reach `TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW`.

## Checks 20-23: Real Runtime State

Checks 20-23 read actual runtime and configuration state:

- **Check 20** — Live scheduler enabled: Reads `isLiveSchedulerEnabled` from the scheduler service. If true, immediately transitions to `LIVE_AUTOMATION_HARD_NO_GO`.
- **Check 21** — Custody provider health: Reads `custodyProviderHealthy` from the custody layer.
- **Check 22** — Exact approval flow availability: Reads `exactApprovalFlowAvailable` from the custody layer.
- **Check 23** — Revoke flow availability: Reads `revokeFlowAvailable` from the custody layer.

These checks query live state and return BLOCKED if the source is unreachable.

## Artifact Expiration

Artifacts have an optional `expiresAt` field (ISO datetime). If set, the artifact is considered **missing** after that time — the associated check will fail until a fresh artifact is uploaded. Artifacts with `expiresAt: null` never expire.

When an artifact expires, its check transitions from PASS to FAIL (or BLOCKED if the check itself cannot run). Always refresh drill artifacts before they expire.

## State Machine

| State | Meaning |
|-------|---------|
| `DEMO_READY` | Demo mode on, dry run operational |
| `DRY_RUN_READY` | Demo mode off, dry run fully operational |
| `MULTI_WALLET_DRY_RUN_READY` | Multiple wallets dry-running successfully |
| `TINY_MANUAL_LIVE_BLOCKED` | All prior gates pass but one or more live gates fail |
| `TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW` | All gates pass; operator can initiate tiny live |
| `LIVE_AUTOMATION_HARD_NO_GO` | Always true; live scheduler is never enabled |
| `LIVE_AUTOMATION_READY` | Always false; reserved for future |

## API

### GET /api/readiness
Returns overall readiness summary.

### POST /api/readiness/run-checks
Runs all 23 readiness checks synchronously. Returns per-check results.

### POST /api/readiness/artifacts
Upload a drill result artifact.

### POST /api/readiness/tiny-wallet
Provision a new dedicated tiny live wallet.

### POST /api/readiness/dismiss-blocker
Operator acknowledges a known blocker (session-only).

## Storage

State: In-memory singleton (resets on restart).
Artifacts: JSON files at `.readiness/artifacts/<type>_<timestamp>.json`