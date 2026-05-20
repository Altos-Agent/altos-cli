# Test CI Deployment Gaps

Date: 2026-05-20

Scope: Unit/integration/E2E tests, CI gating, Docker, deployment, backup/restore, drills, and validation strategy.

Verdict/status: MEDIUM / PARTIAL. Test coverage is broad for a local-first app, but CI and deployment validation do not yet meet product-grade live-safety requirements.

## Current Test Inventory

- IMPLEMENTED: API unit/integration tests cover auth, password hashing, env validation, route validation, vault lock, wallet vault, Telegram, ops, risk policy, aggregate risk, quote validation, planner, scheduler, idempotency, live execution safety, transaction manager, confirmation/finality, and wallet service.
- IMPLEMENTED: Web has `apps/web/lib/api.test.ts`.
- IMPLEMENTED: Playwright E2E tests exist under `e2e/operator-safety.spec.ts` and `e2e/ui-redesign-qa.spec.ts`.
- IMPLEMENTED: CI validates typecheck, lint, test, build, Docker config/build, and migration smoke.
- PARTIAL: E2E is run in CI but masked.

## CI Gaps

- HIGH / PARTIAL: `.github/workflows/ci.yml` uses `pnpm e2e || true` and `continue-on-error: true`, so E2E failures do not fail CI.
- MEDIUM / PARTIAL: Docker smoke uses `|| true` around API container start and health checks, masking failures.
- MEDIUM / PARTIAL: Migration smoke exists, but local audit did not execute a fresh migration/reset.
- MEDIUM / MISSING: No CI job specifically asserts `SCHEDULER_LIVE_EXECUTION=true` is blocked.
- MEDIUM / MISSING: No CI job runs provider load tests.
- MEDIUM / MISSING: No backup/restore or emergency pause drill is gating.

## Deployment Gaps

- HIGH / PARTIAL: `docker-compose.prod.example.yml` contains placeholder secrets and safe demo/dry-run defaults.
- HIGH / PARTIAL: `infra/nginx/nginx.conf` and TLS docs exist, but TLS/firewall/secrets manager setup is operator-dependent.
- HIGH / MISSING: No production-grade secret manager integration for session secret, DB credentials, Telegram token, 0x API key, or custody keys.
- HIGH / MISSING: No tested restore runbook as a release gate.
- MEDIUM / PARTIAL: Dockerfiles exist, but image scanning/signing/SBOM is not present.

## Exact Files Likely Touched

- `.github/workflows/ci.yml`
- `package.json`
- `playwright.config.ts`
- `e2e/operator-safety.spec.ts`
- `e2e/ui-redesign-qa.spec.ts`
- `apps/api/src/**/*.test.ts`
- `apps/api/src/**/*.integration.test.ts`
- `apps/web/lib/api.test.ts`
- `docker-compose.prod.example.yml`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `infra/nginx/nginx.conf`
- `scripts/drills/backup-restore-demo-drill.sh`
- `scripts/drills/emergency-pause-drill.sh`
- `docs/BACKUP_RESTORE_DRILL.md`
- `docs/EMERGENCY_PAUSE_DRILL.md`
- `docs/SERVER_DEPLOYMENT_CHECKLIST.md`

## Acceptance Criteria

- HIGH: E2E failures fail CI.
- HIGH: Docker smoke failures fail CI.
- HIGH: CI has explicit safety tests proving live scheduler remains blocked.
- HIGH: Migration smoke validates fresh DB, demo seed, and rollback/restore where feasible.
- MEDIUM: Provider load test is runnable in safe mock/dry-run mode and has a CI or manual release gate.
- MEDIUM: Backup/restore and emergency pause drills produce timestamped artifacts or logs for operator review.

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
bash scripts/drills/backup-restore-demo-drill.sh
bash scripts/drills/emergency-pause-drill.sh
```
