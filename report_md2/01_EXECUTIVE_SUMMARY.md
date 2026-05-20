# Executive Summary

Date: 2026-05-20

Scope: Fresh read-only audit of current `base-orchestrator` repository, including API, web app, shared schemas, docs, architecture, plans, infra, scripts, migrations, tests, CI, env examples, and safe validation commands. Application source was not modified.

Verdict/status: PARTIAL. Local demo and dry-run flows are in good shape. Tiny manual live testing is not ready without operator verification and a dedicated low-value wallet. Live automation is a hard no-go.

## Overall Current Verdict

The repository implements a local-first Base dashboard with Fastify API, Next.js web UI, auth/session/CSRF, encrypted local wallet vault, dry-run planner, quote abstraction, token/pair/router management, exact approval/revoke flows, guarded manual execute-once, idempotency keys, per-wallet locks, confirmation/finality state, dry-run scheduler, Telegram notifications, observability endpoints, Docker files, and CI.

The system is intentionally conservative and blocks live scheduling. The current live-funds posture remains limited by local-file custody, unverified token/router data, unproven 0x live quote behavior, no completed tiny live test, operator-guided nonce/replacement/reorg handling, partial aggregate-risk enforcement, and server deployment hardening gaps.

## Readiness

| Area | Verdict | Status | Notes |
|---|---:|---:|---|
| Local demo readiness | PASS | IMPLEMENTED | `pnpm test` passes, demo seed exists, demo mode blocks live writes. |
| Dry-run readiness | PASS | IMPLEMENTED | `POST /api/plans/dry-run`, mock quotes, scheduler dry-runs, and UI are implemented. |
| Tiny manual live readiness | FAIL | PARTIAL / OPERATOR_REQUIRED | Manual execute-once exists, but no verified Base token/router/0x configuration or tiny-wallet drill was tested. |
| Live automation readiness | FAIL | MISSING | Live scheduler intentionally throws and design docs mark it as design-only. |
| Server deployment readiness | FAIL | PARTIAL | Docker and nginx exist, but production example uses placeholders, local-file custody is not acceptable for meaningful funds, and auth is single-operator. |

## What Works

- IMPLEMENTED: Fastify API composition in `apps/api/src/server.ts`.
- IMPLEMENTED: Next.js App Router dashboard in `apps/web/app` and `apps/web/components`.
- IMPLEMENTED: Shared Zod schemas in `packages/shared/src/schemas`.
- IMPLEMENTED: Argon2id operator password hashing with legacy SHA-256 verification warning in `apps/api/src/auth/password.ts`.
- IMPLEMENTED: HTTP-only session cookie, CSRF middleware, login rate limits, and Redis/memory session stores in `apps/api/src/auth` and `apps/api/src/http`.
- IMPLEMENTED: AES-256-GCM encrypted local vault in `apps/api/src/vault/wallet-vault.ts`.
- IMPLEMENTED: Vault lock/unlock gate for live signing in `apps/api/src/vault/vault-lock.ts`.
- IMPLEMENTED: Token/pair/router management and verification status fields in `apps/api/src/management` and `apps/api/src/risk/verification.ts`.
- IMPLEMENTED: Dry-run planner and risk checks in `apps/api/src/strategy/planner.ts`.
- IMPLEMENTED: Manual execute-once safety gates in `apps/api/src/trades`.
- IMPLEMENTED: ERC20 allowance reads, exact approve, revoke-to-zero in `apps/api/src/approvals`.
- IMPLEMENTED: Transaction request idempotency and per-wallet pending lock in `apps/api/src/transactions/transaction-manager.ts`.
- IMPLEMENTED: Transaction confirmation/finality/stuck/dropped model in `apps/api/src/transactions/confirmation.ts`.
- IMPLEMENTED: Dry-run scheduler and BullMQ queues in `apps/api/src/scheduler`.
- IMPLEMENTED: Telegram encrypted settings and delivery audit in `apps/api/src/notifications`.
- IMPLEMENTED: Prometheus metrics and ops summary in `apps/api/src/ops`.

## What Is Unsafe

- HIGH / PARTIAL: `VAULT_PROVIDER=local-file` means the master key is a plaintext filesystem file. This is dev/demo only.
- HIGH / OPERATOR_REQUIRED: Seed and demo token/router addresses are placeholders or operator-owned configuration. They are not live-ready by default.
- HIGH / NOT_TESTED: Manual live execute-once was not tested against verified Base mainnet contracts and a funded dedicated wallet.
- HIGH / PARTIAL: Aggregate risk is enforced on dry-run planning, but not clearly enforced in manual live execute-once before signing.
- HIGH / PARTIAL: Replacement/cancel/reorg handling is operator-guided rather than automated.
- MEDIUM / PARTIAL: Single-operator auth has no roles, MFA, identity provider, or explicit public-internet hardening.
- MEDIUM / PARTIAL: CI E2E step uses `pnpm e2e || true` and `continue-on-error: true`, so E2E failures can be hidden.
- MEDIUM / PARTIAL: Docker production example renders, but ships demo/dry-run defaults and placeholder secrets.

## Top 10 Strengths

1. IMPLEMENTED: Dry-run default is enforced in config and README.
2. IMPLEMENTED: Demo mode requires dry-run in `apps/api/src/config/env.ts`.
3. IMPLEMENTED: Live scheduler flag is rejected in env/service logic.
4. IMPLEMENTED: Live writes require explicit confirmation and idempotency keys.
5. IMPLEMENTED: Wallet private keys are encrypted and API responses omit encrypted/plaintext key material.
6. IMPLEMENTED: Vault lock blocks live signing routes while locked.
7. IMPLEMENTED: Token/router verification states block risky dry-run/live paths.
8. IMPLEMENTED: Exact approval and revoke flows avoid default unlimited approvals.
9. IMPLEMENTED: Transaction finality model includes pending-finality, stuck, dropped, and replacement-review states.
10. IMPLEMENTED: Tests pass across API and web unit/integration coverage.

## Top 10 Critical/High Risks

1. HIGH / OPERATOR_REQUIRED: No verified live Base token/router/allowance target set is proven.
2. HIGH / NOT_TESTED: No tiny manual live test was executed in this audit.
3. HIGH / PARTIAL: Local-file vault is unsuitable for meaningful funds.
4. HIGH / PARTIAL: Aggregate risk is not consistently a pre-signing live gate.
5. HIGH / MISSING: Live scheduler execution is intentionally not implemented.
6. HIGH / PARTIAL: Nonce/replacement/reorg recovery is manual and can strand wallets.
7. HIGH / PARTIAL: 0x quote provider behavior is not live-validated in this workspace.
8. HIGH / OPERATOR_REQUIRED: Server deployment needs real secrets, TLS certs, Redis sessions, and custody upgrade.
9. HIGH / PARTIAL: CI can hide E2E failures due `pnpm e2e || true`.
10. HIGH / UNCLEAR: Docker API deploy emits bin-link warnings during `pnpm deploy`; image built, but runtime smoke was not run here.

## Top 10 Next Actions

1. Wire aggregate risk into manual live execute-once immediately before signing.
2. Add an operator-verified token/router/allowance-target checklist artifact before enabling any live test.
3. Run a zero-funds 0x quote validation drill against verified Base addresses.
4. Run a tiny manual live test only with a dedicated low-value wallet and exact approval.
5. Add post-test revoke, finality, and Basescan verification acceptance criteria.
6. Remove `pnpm e2e || true` from CI or make E2E explicitly non-gating with a separate status badge.
7. Add runtime smoke for built API and web Docker images.
8. Move production custody roadmap from docs to a real provider implementation before meaningful funds.
9. Add operator runbook for stuck/dropped/replaced transaction nonce checks.
10. Keep live scheduler blocked until all gates in `plan/06_LIVE_SCHEDULER_IMPLEMENTATION_GATES.md` pass.

## Validation Results

| Command | Result | Notes |
|---|---:|---|
| `pnpm typecheck` | PASS | Shared, API, and web typecheck passed. |
| `pnpm lint` | PASS | Shared, API, and web lint passed. |
| `pnpm test` | PASS | API: 36 files, 149 tests. Web: 1 file, 2 tests. |
| `pnpm docker:compose:prod:check` | PASS | Rendered production Compose config. |
| `docker build -f apps/web/Dockerfile -t base-orchestrator-web:audit-report-md2 .` | PASS | Web image built successfully. |
| `docker build -f apps/api/Dockerfile -t base-orchestrator-api:audit-report-md2 .` | PASS_AFTER_RETRY | First attempt failed on npm registry timeout; retry built successfully. |
| `pnpm build` | NOT_RUN | Skipped because Next build writes under `apps/web/.next`, outside allowed `report_md2/` write boundary. |
| `pnpm e2e` | NOT_RUN | Skipped because Playwright/Next dev writes generated artifacts outside `report_md2/`. |

## Go/No-Go Recommendation

Local demo: GO.

Dry-run: GO.

Tiny manual live: NO-GO until operator verification, dedicated wallet, exact approval, 0x quote validation, backup/restore drill, emergency pause drill, Telegram notification test, and finality observation checklist pass.

Live automation: HARD NO-GO.

Server deployment: NO-GO for exposed/public or meaningful-funds use. Local/private dry-run server deployment can proceed only with production secrets replaced and Redis-backed sessions.
