# No-Go Conditions

Date: 2026-05-20

Scope: Conditions that block tiny manual live execution, live scheduler, server deployment, and meaningful funds.

Verdict/status: CRITICAL / OPERATOR_REQUIRED. Live scheduler is a hard no-go until every scheduler gate below is resolved and tested.

## No-Go For Tiny Manual Live

- CRITICAL: Aggregate risk uses raw token units or unknown USD notional.
- CRITICAL: Manual execute-once does not enforce aggregate risk immediately before signing.
- CRITICAL: Token, router, tx target, or allowance target is not VERIFIED for Base.
- CRITICAL: Operator has not configured a dedicated low-value wallet.
- CRITICAL: Vault is not explicitly unlocked for a short test window.
- HIGH: Backup/restore drill is not proven.
- HIGH: Emergency pause drill is not proven.
- HIGH: Telegram or alert path is not tested if operator relies on it.
- HIGH: 0x provider quote behavior has not been verified for the exact pair/router.
- HIGH: Revoke step and rollback plan are missing.

## No-Go For Live Scheduler

- CRITICAL: `SCHEDULER_LIVE_EXECUTION` cannot be enabled until source contains a safe live scheduler state machine.
- CRITICAL: No aggregate risk reservation ledger.
- CRITICAL: No nonce reservation lifecycle.
- CRITICAL: No post-sign ambiguity handling.
- CRITICAL: Queue retries can duplicate submission or retry after signing.
- CRITICAL: No DLQ/operator disposition path.
- CRITICAL: No production custody provider or approved external signer.
- CRITICAL: E2E failures are masked in CI.
- HIGH: Provider 429/5xx behavior is unclassified.
- HIGH: 5+/10+ wallet provider load is unproven.
- HIGH: Trace IDs do not persist from job to tx to notification.
- HIGH: Stuck/dropped/replaced handling remains only operator-guided.
- HIGH: Backup/restore, emergency pause, and alert drills are not passing release gates.

## No-Go For Server Deployment With Live Funds

- CRITICAL: Local-file vault is active.
- CRITICAL: Production secrets are placeholders or env-file based without secret manager controls.
- CRITICAL: Redis-backed rate limiting/session storage is absent or can silently fall back to memory.
- HIGH: TLS/firewall/reverse proxy setup is not verified.
- HIGH: Database backup/restore is not drilled.
- HIGH: Monitoring and alerting are not configured and tested.
- HIGH: Docker/CI smoke failures are masked.

## Exact Files That Enforce Or Should Enforce No-Go Gates

- `apps/api/src/config/env.ts`
- `apps/api/src/runtime/mode.ts`
- `apps/api/src/runtime/runtime-status.ts`
- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/approvals/approval-routes.ts`
- `apps/api/src/risk/aggregate-risk.ts`
- `apps/api/src/risk/verification.ts`
- `apps/api/src/vault/vault-lock.ts`
- `apps/api/src/vault/providers/*`
- `.github/workflows/ci.yml`
- `docker-compose.prod.example.yml`
- `docs/SERVER_DEPLOYMENT_CHECKLIST.md`

## Acceptance Criteria To Clear Live Scheduler No-Go

- Every CRITICAL no-go condition above has an automated test or documented operator drill.
- Live scheduler starts only when runtime status reports all safety gates green.
- Operator UI shows no-go status before scheduler start.
- CI fails on scheduler safety regressions.
- Product docs explicitly prohibit abusive wash-trading/deceptive volume use cases.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
pnpm docker:compose:prod:check
pnpm docker:build:api
pnpm docker:build:web
```
