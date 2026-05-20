# Phase 1 Risk Engine Report

Date: 2026-05-20

Scope: Implementation report for USD-normalized aggregate risk accounting and the manual live execute-once pre-sign aggregate risk gate.

Verdict/status: IMPLEMENTED / PARTIAL. Phase 1 code, migration, tests, and docs are implemented. Live scheduler remains disabled.

## Implemented

- Added explicit transaction USD accounting fields in `apps/api/src/db/schema.ts`.
- Added migration `apps/api/drizzle/0013_usd_normalized_risk_accounting.sql`.
- Updated aggregate risk calculation in `apps/api/src/risk/aggregate-risk.ts` to use `amountInUsd` and `gasUsd`, not raw token units.
- Added structured aggregate risk codes:
  - `AGGREGATE_DAILY_TRADE_LIMIT_EXCEEDED`
  - `AGGREGATE_PENDING_TRADE_LIMIT_EXCEEDED`
  - `AGGREGATE_DAILY_GAS_LIMIT_EXCEEDED`
  - `AGGREGATE_PENDING_WALLET_LIMIT_EXCEEDED`
  - `AGGREGATE_FAILED_TX_LIMIT_EXCEEDED`
  - `AGGREGATE_RISK_DISABLED_OR_UNCONFIGURED`
- Enforced aggregate risk in `apps/api/src/trades/trade-routes.ts` after quote/simulation and before `loadOrCreateMasterKey()` / `decryptPrivateKey()`.
- Stored risk snapshot data on rejected/submitted live transactions where applicable.
- Preserved dry-run behavior and added normalized USD fields to dry-run transaction records.
- Kept live scheduler disabled in `apps/api/src/scheduler/scheduler-service.ts` and `apps/api/src/scheduler/trade.worker.ts`.

## Important Caveats

- PARTIAL: USD notional derivation is currently stablecoin-parity based for verified stablecoin symbols from mock/0x quote paths. Non-stablecoin live notional must be backed by a real USD price source in a later provider hardening phase.
- PARTIAL: Approval/revoke flows enforce emergency pause, vault unlock, idempotency, and token/router verification, but route-level rate limits remain a later phase.
- PARTIAL: Legacy `amountIn`/`amountOut` fields remain for compatibility; aggregate risk must continue to ignore them.

## Files Changed

- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0013_usd_normalized_risk_accounting.sql`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/drizzle/meta/0013_snapshot.json`
- `apps/api/src/risk/aggregate-risk.ts`
- `apps/api/src/risk/aggregate-risk.test.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/trades/execute-once-aggregate-risk.integration.test.ts`
- `apps/api/src/strategy/planner.ts`
- `apps/api/src/strategy/plan-routes.ts`
- `apps/api/src/scheduler/scheduled-dry-run.ts`
- `apps/api/src/quote/types.ts`
- `apps/api/src/quote/providers/mock.ts`
- `apps/api/src/quote/providers/zeroX.ts`
- `packages/shared/src/schemas/quote.ts`
- `apps/api/src/approvals/approval-service.ts`
- `apps/api/src/transactions/confirmation.ts`
- `apps/api/src/test-utils/in-memory-db.ts`
- `apps/web/lib/types.ts`
- `apps/web/app/(app)/transactions/[id]/page.tsx`
- `docs/USD_NORMALIZED_RISK_ACCOUNTING.md`
- `docs/README.md`

## Acceptance Criteria Status

- PASS: No manual live signing path can proceed without aggregate risk enforcement.
- PASS: Aggregate pending exposure uses USD-normalized values only.
- PASS: Tests prove raw token unit accounting is not used.
- PASS: Execute-once rejects before key decryption when aggregate cap is breached.
- PASS: Dry-run aggregate checks still work.
- PASS: Risk snapshots are stored when the aggregate gate runs.
- PASS: Live scheduler remains disabled.

## Validation Commands

```bash
pnpm --filter @base-orchestrator/api test -- src/risk/aggregate-risk.test.ts src/strategy/plan-routes.integration.test.ts src/trades/live-execution.test.ts src/trades/execute-once-aggregate-risk.integration.test.ts src/db/migration-metadata.test.ts
pnpm --filter @base-orchestrator/api test
pnpm typecheck
pnpm lint
pnpm test
```

## Recommended Next Phase

Implement provider hardening: real USD price source metadata, 0x failure classification, gas USD estimation, quote/provider metrics, and 5+/10+ wallet dry-run load proof.
