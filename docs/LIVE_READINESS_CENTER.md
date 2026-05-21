# Live Readiness Center

## Overview

The Live Readiness Center definitively answers whether the system is ready for one tiny, operator-reviewed live execute-once trade using a dedicated low-value wallet.

**Important:** This is NOT live automation. The live scheduler remains disabled. This center only gates a single, tiny, manual live test.

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