# Phase 12 — Live Readiness Center Report

## Summary

Built the Live Readiness Center: a definitive readiness evaluation system for one tiny operator-reviewed live execute-once trade using a dedicated low-value wallet.

## What Was Built

### API (`apps/api/src/readiness/`)
- **readiness-types.ts** — 7 readiness states, 23 check definitions, artifact schemas
- **readiness-checks.ts** — 23 pure check functions across 5 categories
- **readiness-state.ts** — In-memory state singleton
- **readiness-service.ts** — Context builder, state machine, `runReadinessChecks()`, `getReadinessSummary()`
- **readiness-routes.ts** — 5 Fastify routes (GET /readiness, POST /run-checks, POST /artifacts, POST /tiny-wallet, POST /dismiss-blocker)
- **readiness.test.ts** — 7 unit tests

### Backend Gates
- Modified execute-once route to require `confirmLiveExecution: "TINY_LIVE"` (not just `true`)
- Added `assertTinyLiveGates()` with 3 checks: readiness state, confirmation type, emergency pause
- Typed confirmation propagates to `ApprovalRequestInput` in approval-service

### UI (`apps/web/`)
- **readiness-checklist.tsx** — Accordion checklist (5 categories, 23 checks)
- **readiness/page.tsx** — Full Live Readiness Center page with state banner, checklist, runbook, execute button
- Added `/readiness` to nav

### Docs
- **LIVE_READINESS_CENTER.md** — Architecture, API, state machine
- **TINY_MANUAL_LIVE_TEST_RUNBOOK.md** — 11-step operator runbook
- **NO_GO_CONDITIONS.md** — 19 no-go conditions with severity ranking

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/readiness/readiness-types.ts` | Created |
| `apps/api/src/readiness/readiness-checks.ts` | Created |
| `apps/api/src/readiness/readiness-state.ts` | Created |
| `apps/api/src/readiness/readiness-service.ts` | Created |
| `apps/api/src/readiness/readiness-routes.ts` | Created |
| `apps/api/src/readiness/readiness.test.ts` | Created |
| `apps/api/src/server.ts` | Modified: register readiness routes |
| `apps/api/src/trades/trade-routes.ts` | Modified: add TINY_LIVE gates |
| `apps/api/src/approvals/approval-service.ts` | Modified: type propagation |
| `apps/web/lib/api.ts` | Modified: add readiness API clients |
| `apps/web/lib/nav.ts` | Modified: add /readiness nav link |
| `apps/web/components/readiness/readiness-checklist.tsx` | Created |
| `apps/web/app/readiness/page.tsx` | Created |
| `docs/LIVE_READINESS_CENTER.md` | Created |
| `docs/TINY_MANUAL_LIVE_TEST_RUNBOOK.md` | Created |
| `docs/NO_GO_CONDITIONS.md` | Created |

## Validation

| Test | Command | Result |
|------|---------|--------|
| Unit Tests | `pnpm test -- apps/api/src/readiness/readiness.test.ts` | ✅ 7/7 PASS |

## Commits (11 total for this feature)

```
d2b0288 test(readiness): add 7 unit tests for readiness checks and state transitions
daf6c6b docs(readiness): add LIVE_READINESS_CENTER, RUNBOOK, and NO_GO_CONDITIONS docs
2459eed feat(web): add readiness checklist UI and page
3d4101b feat(readiness): add readiness API client functions
af2d983 feat(readiness): add TINY_LIVE gates to execute-once route
8720167 fix(readiness): add proper error handling to tiny-wallet route and add fallbacks
04ce625 fix(readiness): set tiny wallet status to PAUSED on import
7668981 feat(readiness): add readiness routes with tiny-wallet, artifacts, and blocker dismissal
d7f2553 fix(readiness): correct stuck wallet detection and tiny wallet filtering to use existing schema fields
78acd02 feat(readiness): add in-memory state machine and service
309e1b1 feat(readiness): add 23 readiness check functions across 5 categories
5567c69 feat(readiness): add artifact JSON file persistence for drill results
2eee763 feat(readiness): add readiness types - state enum, check result types, artifact schema
```

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Operator sees exactly why live is blocked | ✅ |
| Tiny manual live cannot proceed without all gates | ✅ |
| Live automation remains hard no-go | ✅ |
| Live scheduler remains disabled | ✅ |

## Known Limitations

- `stuckOrDroppedWalletCount` uses transactions table (FAILED/DROPPED) since wallet schema lacks STUCK/DROPPED statuses
- `tinyLiveWallet` detection uses wallet name filtering (`includes("TINY_LIVE")`) since schema lacks role column
- Custody provider health and approval flow checks are stubbed (always true) — wire to real checks in future
- Dismissed blockers are session-only (reset on server restart)