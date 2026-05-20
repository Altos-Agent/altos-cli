# Repository Map And Module Ownership

Date: 2026-05-20

Scope: Repository structure, major modules, boundaries, docs, infra, scripts, generated artifacts, untracked files, and worktree hygiene.

Verdict/status: PARTIAL. The module layout is coherent, but the worktree is highly dirty and many important files are untracked.

## Folder Map

| Path | Status | Purpose |
|---|---:|---|
| `apps/api/` | IMPLEMENTED | Fastify API, Drizzle schema, migrations, tests, Dockerfile. |
| `apps/web/` | IMPLEMENTED | Next.js dashboard, UI components, client/server API wrapper, Dockerfile. |
| `packages/shared/` | IMPLEMENTED | Shared constants, amount helpers, Zod schemas. |
| `architecture/` | IMPLEMENTED | AI/operator architecture docs and threat models. |
| `docs/` | IMPLEMENTED | Local setup, auth, Telegram, server deployment, drills, runbooks. |
| `plan/` | IMPLEMENTED | Build plan, risks, debt, test plan, live scheduler gates. |
| `infra/` | PARTIAL | Nginx config and TLS placeholder docs. |
| `scripts/` | PARTIAL | Backup/restore and safety drill scripts. |
| `e2e/` | IMPLEMENTED | Playwright operator-safety and UI QA specs. |
| `.github/workflows/` | PARTIAL | CI exists but E2E is non-gating. |
| `report_md/` | EXISTING | Previous reports retained as requested. |
| `report_md2/` | IMPLEMENTED | Current audit outputs. |

## Major Modules And Owner Files

| Module | Owner files |
|---|---|
| Server composition | `apps/api/src/server.ts` |
| Runtime config | `apps/api/src/config/env.ts`, `apps/api/src/config/runtime-config.ts` |
| Auth/session/CSRF | `apps/api/src/auth/*`, `apps/api/src/http/rate-limit-provider.ts` |
| Wallets/backups | `apps/api/src/wallets/*` |
| Vault/custody | `apps/api/src/vault/*` |
| Token/pair/router management | `apps/api/src/management/*`, `apps/api/src/risk/verification.ts` |
| Dry-run planner | `apps/api/src/strategy/*`, `apps/api/src/risk/*` |
| Quotes | `apps/api/src/quote/*` |
| Approvals | `apps/api/src/approvals/*` |
| Manual execute-once | `apps/api/src/trades/*` |
| Transaction lifecycle | `apps/api/src/transactions/*` |
| Scheduler/queues | `apps/api/src/scheduler/*` |
| Notifications | `apps/api/src/notifications/*` |
| Ops/metrics/health | `apps/api/src/ops/*`, `apps/api/src/runtime/*` |
| Web app shell | `apps/web/components/app-shell.tsx`, `apps/web/components/sidebar-nav.tsx` |
| Web API wrapper | `apps/web/lib/api.ts` |
| UI components | `apps/web/components/*`, `apps/web/components/ui/*` |
| Shared validation | `packages/shared/src/schemas/*` |

## API/Web/Shared Boundaries

- IMPLEMENTED: API validates routes through shared schemas and route helpers in `apps/api/src/http/validation.ts`.
- IMPLEMENTED: Web calls API through `apps/web/lib/api.ts` and forwards cookies server-side using `next/headers`.
- IMPLEMENTED: Shared schemas cover auth, wallet import/backup, token, pair, router, quote, trade, approval, Telegram, scheduler, and common ids/amounts.
- PARTIAL: Some route param ids use broad route id format rather than UUID-only semantics, which is practical for tests but should be reviewed for public server exposure.

## Docs, Architecture, Plan, And Reports

- IMPLEMENTED: Current docs state dry-run default, local-first operation, no seed phrases, and live scheduler not implemented.
- IMPLEMENTED: Architecture docs map wallet security, transaction flow, risk engine, Telegram, deployment, live scheduler threat model, design, and custody architecture.
- IMPLEMENTED: Plan docs include known risks, test plan, technical debt, and live scheduler gates.
- INFO: Previous `report_md/` exists and was not deleted.

## Infra, Scripts, CI

- IMPLEMENTED: `docker-compose.yml` starts Postgres, Redis, optional pgAdmin.
- PARTIAL: `docker-compose.prod.example.yml` renders and includes nginx, api, web, Postgres, Redis, healthchecks, internal backend network, and volumes.
- PARTIAL: `infra/nginx/nginx.conf` sets TLS, HSTS, security headers, and proxies API/web.
- PARTIAL: Backup and drill scripts exist under `scripts/backup` and `scripts/drills`.
- PARTIAL: CI runs install, typecheck, lint, test, build, docker smoke, migration smoke. E2E is intentionally non-gating due `pnpm e2e || true`.

## Generated Artifacts

- INFO: `apps/api/dist`, `apps/web/.next`, `node_modules`, `apps/*/node_modules`, `test-results` are present.
- RISK: Generated artifacts inside app folders increase audit noise and can obscure source-of-truth changes if accidentally committed.

## Untracked Or Suspicious Files

`git status --short --branch` shows a dirty worktree on `main...origin/main` with many modified and untracked files.

Notable untracked or hygiene items:

- `.directory`
- `.dockerignore`
- `.github/`
- `DESIGN.md`
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- multiple new migrations and snapshots from `0005` through `0012`
- new auth, config, ops, security, risk, scheduler, vault, transaction modules
- `e2e/`
- `infra/`
- `scripts/`
- `test-results/`

## Worktree Hygiene Issues

- HIGH / PARTIAL: Many important implementation files are untracked, including auth, security, Docker, migrations, and CI.
- HIGH / PARTIAL: Several old `report_md` files show deleted while replacement report files are untracked.
- MEDIUM / PARTIAL: Generated folders are present in the tree and should be excluded/cleaned before release.
- MEDIUM / OPERATOR_REQUIRED: Before any release, commit intended files and remove or ignore accidental local artifacts.

## Actionable Fixes And Acceptance Criteria

- Fix: Commit or intentionally discard all source, migration, docs, infra, CI, and report changes.
- Acceptance: `git status --short` shows only intentional audit reports or a clean tree before release.
- Fix: Ensure `.gitignore` excludes `.next`, `dist`, `test-results`, local keys, database dumps, encrypted backups, and environment files.
- Acceptance: Fresh build/test does not create untracked generated artifacts that can be confused with source.
