# Next Phase Implementation Plan

Date: 2026-05-13  
Scope: Phased plan from current state through tiny manual live preparation, hardening, dry-run scaling, automation, and server deployment.  
Verdict/status: PLAN_READY.

## Phase 1: Remaining Blockers Before Tiny Manual Live Test

Goal: Convert code readiness into operator-reviewed live-test readiness.

Tasks: reconcile dirty worktree/migrations, run `pnpm build`, run `pnpm e2e`, verify token/router/provider addresses, add checklist evidence fields/docs if needed, run backup/restore drill.

Files likely touched: `report_md/*`, docs/checklists, possibly `apps/api/drizzle/*` for metadata hygiene, no live code unless defects are found.

Acceptance criteria: typecheck/lint/test/build/E2E pass; verification evidence recorded; no placeholder live addresses; restore drill documented.

Validation commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`, `docker compose config`.

No-go conditions: unknown router/spender, failed restore, failed E2E, dirty migration metadata unresolved.

## Phase 2: Tiny Manual Live Test Preparation

Goal: Prepare one low-value, operator-controlled live execute-once.

Tasks: create dedicated wallet, import key locally, fund minimally, configure live provider, configure exact token/pair/router, run dry-runs, unlock vault briefly, test emergency pause, configure Telegram or document waiver.

Files likely touched: operator environment only; optional report/checklist updates.

Acceptance criteria: dry-run matches expected trade, allowance target verified, vault locked/unlocked as expected, emergency pause tested, stop conditions acknowledged.

Validation commands: dry-run route/UI, allowance read, vault status, runtime status, ops summary.

No-go conditions: any mismatch in target/calldata/amount/decimals/provider, unclear balances, missing backup.

## Phase 3: Manual Live Execute-Once Hardening After Test

Goal: Improve manual live reliability based on observed tiny test.

Tasks: document finality timing, stuck/dropped behavior, revoke result, quote/provider issues, UI friction; add tests for discovered edge cases.

Files likely touched: `docs/`, `report_md/`, API/web tests, possibly transaction/approval code if defects are found.

Acceptance criteria: complete post-test report, all allowances revoked or documented, no unresolved submitted tx, tests cover discovered issue.

Validation commands: `pnpm test`, targeted API tests, UI E2E if UI changes.

No-go conditions: stuck transaction unresolved, allowance not understood, emergency pause unclear.

## Phase 4: Multi-Wallet Dry-Run Scaling

Goal: Scale safe dry-run scheduling across wallets without live execution.

Tasks: add aggregate exposure summaries, queue depth visibility, scheduler dry-run dashboards, provider/RPC rate observations, richer failure metrics.

Files likely touched: `apps/api/src/scheduler/*`, `apps/api/src/ops/*`, `apps/web/app/(app)/dashboard/page.tsx`, tests.

Acceptance criteria: dry-run queues remain stable, per-wallet limits enforced, operator can see failures/queue depth.

Validation commands: `pnpm test`, `pnpm e2e`, scheduler integration tests.

No-go conditions: duplicate jobs, unclear queue failure, API 5xx under dry-run load.

## Phase 5: Live Automation Hardening After Safety Gates

Goal: Only after manual live safety is proven, design unattended live execution.

Tasks: threat model, nonce/replacement recovery, hardware/KMS/MPC custody, aggregate limits, approval workflow, monitor/alert, simulation fallback, kill switch drills.

Files likely touched: broad API scheduler/trade/vault/risk/ops modules, docs, tests.

Acceptance criteria: design approved, tests cover failure modes, live scheduler no longer rejects only after explicit safety implementation.

Validation commands: expanded unit/integration/E2E, chaos/failure tests, deployment smoke.

No-go conditions: local file custody for meaningful funds, missing replacement recovery, missing monitoring.

## Phase 6: Server Deployment Hardening

Goal: Make dry-run/server deployment safe, then later consider live-funds hosting only with stronger custody.

Tasks: production secret manager, adaptive password hash, login rate limits, durable sessions, TLS renewal, firewall, backup/restore automation, monitoring/alerts, CI.

Files likely touched: `docker-compose.prod.example.yml`, `apps/api/src/auth/*`, `infra/`, `docs/`, CI files.

Acceptance criteria: production compose/image smoke passes, secrets removed from examples, monitoring active, restore drill passes.

Validation commands: Docker builds, compose config, container health smoke, security tests.

No-go conditions: placeholder secrets, exposed DB/Redis/API, no TLS, no backup restore, local-file custody for live funds.

