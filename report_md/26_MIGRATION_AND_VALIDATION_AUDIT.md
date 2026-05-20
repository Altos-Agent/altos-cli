# Migration And Validation Audit

Date: 2026-05-13  
Scope: Phase 1 repository hygiene, Drizzle migration metadata reconciliation, fresh local migration smoke, and full validation.  
Verdict/status: PASS with one documented seed-composition caveat.

## Summary

Drizzle migration metadata was reconciled through `0010_phase_i_transaction_status`. The latest snapshot now matches `apps/api/src/db/schema.ts`; `drizzle-kit generate` reports no schema changes. A regression test was added to keep SQL migrations, journal entries, and snapshots in lockstep.

No business logic, trading behavior, vault behavior, auth gates, live scheduler defaults, or blockchain execution paths were changed.

## Prior Audit Files Checked

| File | Status |
| --- | --- |
| `report_md/22_PHASE_I_COMPLETION_AUDIT.md` | Not present |
| `report_md/23_UI_REDESIGN_AUDIT.md` | Not present |

## Migration Files Found

| Migration | Status |
| --- | --- |
| `0000_stormy_sentinel.sql` | Present |
| `0001_curly_starjammers.sql` | Present |
| `0002_busy_kulan_gath.sql` | Present |
| `0003_brainy_captain_america.sql` | Present |
| `0004_lethal_omega_flight.sql` | Present |
| `0005_global_emergency_pause.sql` | Present |
| `0006_notification_deliveries.sql` | Present |
| `0007_live_hardening_foundation.sql` | Present |
| `0008_confirmation_finality.sql` | Present |
| `0009_scheduler_hardening.sql` | Present |
| `0010_phase_i_transaction_status.sql` | Present |

No duplicate migration names were found.

## Metadata Files Found

| Metadata file | Status |
| --- | --- |
| `meta/_journal.json` | Present and ordered through idx 10 |
| `meta/0000_snapshot.json` | Present |
| `meta/0001_snapshot.json` | Present |
| `meta/0002_snapshot.json` | Present |
| `meta/0003_snapshot.json` | Present |
| `meta/0004_snapshot.json` | Present |
| `meta/0005_snapshot.json` | Added |
| `meta/0006_snapshot.json` | Added |
| `meta/0007_snapshot.json` | Added |
| `meta/0008_snapshot.json` | Added |
| `meta/0009_snapshot.json` | Added |
| `meta/0010_snapshot.json` | Added |

## Fixes Applied

1. Added `apps/api/src/db/migration-metadata.test.ts`.
   - Verifies journal tags match SQL migration files.
   - Verifies journal indexes are contiguous and ordered.
   - Verifies each journaled migration has a corresponding snapshot number.
   - Verifies duplicate journal tags are rejected.

2. Reconstructed missing Drizzle snapshots for `0005` through `0010`.
   - The latest `0010_snapshot.json` reflects the current `apps/api/src/db/schema.ts`.
   - Running `pnpm --filter @base-orchestrator/api db:generate` now reports no schema changes.

3. Removed an unsafe generated `0011_wet_sir_ram.sql` attempt.
   - The first `db:generate` run exposed the drift by creating a migration containing changes already represented by `0005`-`0010`.
   - That generated migration and its snapshot were removed before validation.

4. Updated docs:
   - `docs/OPERATIONS_RUNBOOK.md` now includes migration metadata checks and a disposable DB smoke flow.
   - `plan/04-technical-debt.md` records the migration metadata regression check and future caution.

## Fresh Local Migration Smoke

Temporary database: `base_orchestrator_migration_smoke_20260513`

| Step | Command | Result |
| --- | --- | --- |
| Start local Postgres | `docker compose up -d postgres redis` | PARTIAL: Postgres started; Redis port `6379` was already in use, so Redis did not start. Migration smoke only required Postgres. |
| Create disposable DB | `docker compose exec -T postgres createdb -U base_orchestrator base_orchestrator_migration_smoke_20260513` | PASS |
| Apply migrations from zero | `DATABASE_URL=...base_orchestrator_migration_smoke_20260513 DEMO_MODE=true DRY_RUN=true SCHEDULER_LIVE_EXECUTION=false QUOTE_PROVIDER=mock pnpm --filter @base-orchestrator/api db:migrate` | PASS |
| Base seed | same `DATABASE_URL`, `pnpm --filter @base-orchestrator/api db:seed` | PASS |
| Cleanup | `docker compose exec -T postgres dropdb -U base_orchestrator base_orchestrator_migration_smoke_20260513` | PASS |

Temporary demo database: `base_orchestrator_demo_smoke_20260513`

| Step | Command | Result |
| --- | --- | --- |
| Create disposable DB | `docker compose exec -T postgres createdb -U base_orchestrator base_orchestrator_demo_smoke_20260513` | PASS |
| Apply migrations from zero | `DATABASE_URL=...base_orchestrator_demo_smoke_20260513 DEMO_MODE=true DRY_RUN=true SCHEDULER_LIVE_EXECUTION=false QUOTE_PROVIDER=mock pnpm --filter @base-orchestrator/api db:migrate` | PASS |
| Demo seed | same `DATABASE_URL`, `pnpm --filter @base-orchestrator/api demo:seed` | PASS |
| Cleanup | `docker compose exec -T postgres dropdb -U base_orchestrator base_orchestrator_demo_smoke_20260513` | PASS |

## Seed Caveat

Running `demo:seed` after `db:seed` in the same fresh database failed with a duplicate `tokens_chain_symbol_idx` value for `(8453, USDC)`. This is not a migration failure. It means the base seed and demo seed currently own overlapping token symbols and should be validated in separate disposable databases unless the seed ownership rules are changed.

## Validation Commands

| Command | Result |
| --- | --- |
| `pnpm --filter @base-orchestrator/api test src/db/migration-metadata.test.ts` before fix | FAIL: missing snapshots for 0005-0010 |
| `pnpm --filter @base-orchestrator/api test src/db/migration-metadata.test.ts` after fix | PASS |
| `pnpm --filter @base-orchestrator/api db:generate` after fix | PASS: no schema changes |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS: API 32 files / 110 tests, web 1 file / 2 tests |
| `pnpm build` | PASS |
| `pnpm e2e` | PASS: 11 Playwright tests |
| `pnpm docker:compose:prod:check` | PASS |

## Remaining Migration Risks

| Severity | Risk | Status |
| --- | --- | --- |
| MEDIUM | Snapshots `0005`-`0010` were reconstructed after historical metadata was missing; keep them under review before future migration generation. | DOCUMENTED |
| MEDIUM | Base seed and demo seed conflict if run sequentially in the same fresh DB. | DOCUMENTED |
| LOW | Local Redis port `6379` was already occupied during `docker compose up -d postgres redis`; not relevant to migration apply, but affects full local compose startup. | DOCUMENTED |

## Production Build Clean From Migration Perspective

PASS. Migration files, journal entries, and snapshot files are now complete through `0010`; the latest snapshot matches `apps/api/src/db/schema.ts`; `db:generate` produces no corrective migration; fresh migrations apply from zero; and `pnpm build` passes.

## Security Gate Confirmation

- `DEMO_MODE=true`, `DRY_RUN=true`, and `SCHEDULER_LIVE_EXECUTION=false` were preserved for smoke commands.
- No blockchain transactions were sent.
- No live scheduler was enabled.
- No private keys were imported.
- No secrets were exposed.
- No backend security behavior was weakened.

