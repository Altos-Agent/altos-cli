# Repository Map
Date: 2026-05-08
Repository audit scope: Folder structure, package boundaries, generated artifacts, docs, and expected local-first trading dashboard modules.
Verdict/status: PARTIAL. The repository is organized well enough for local development, but cleanup and clearer production boundaries are needed.

## Folder Structure Overview

| Path | Status | Purpose |
|---|---|---|
| `apps/api/` | IMPLEMENTED | Fastify API, wallet vault, DB access, risk/planner, approvals, live execute-once, scheduler, Telegram, tests. |
| `apps/web/` | IMPLEMENTED | Next.js dashboard, dark UI, wallets, transactions, settings, Telegram, scheduler, token/pair/router management. |
| `packages/shared/` | IMPLEMENTED | Shared constants and lightweight shared types. |
| `architecture/` | IMPLEMENTED | AI-readable architecture docs. |
| `plan/` | IMPLEMENTED | Build status, test plan, risks, technical debt. |
| `docs/` | IMPLEMENTED | User-facing local setup, wallet security, Telegram, Basescan, operations runbook. |
| `apps/api/drizzle/` | IMPLEMENTED | Drizzle migrations and metadata snapshots. |
| `report_md/` | IMPLEMENTED | This audit report folder. |

## Major Owner Files

| Module | Owner file(s) |
|---|---|
| API composition | `apps/api/src/server.ts` |
| Wallet import/vault API | `apps/api/src/wallets/wallet-service.ts`, `apps/api/src/wallets/wallet-routes.ts` |
| Crypto/vault primitives | `apps/api/src/vault/wallet-vault.ts` |
| Encrypted wallet backups | `apps/api/src/wallets/encrypted-backup.ts` |
| DB schema | `apps/api/src/db/schema.ts` |
| Demo seed/reset | `apps/api/src/db/demo-data.ts`, `apps/api/src/db/demo-seed.ts`, `apps/api/src/db/demo-reset.ts` |
| Token/pair/router management | `apps/api/src/management/management-service.ts`, `apps/api/src/management/management-routes.ts` |
| Risk policy helpers | `apps/api/src/risk/*.ts`, `apps/api/src/management/risk-policy.ts` |
| Dry-run planner | `apps/api/src/strategy/planner.ts`, `apps/api/src/strategy/plan-routes.ts` |
| Quote providers | `apps/api/src/quote/quoteEngine.ts`, `apps/api/src/quote/providers/mock.ts`, `apps/api/src/quote/providers/zeroX.ts` |
| Live execute-once | `apps/api/src/trades/trade-routes.ts`, `apps/api/src/trades/live-execution.ts` |
| ERC20 approvals | `apps/api/src/approvals/approval-service.ts`, `apps/api/src/approvals/approval-policy.ts` |
| Transaction history/confirmation | `apps/api/src/transactions/confirmation.ts`, `apps/api/src/transactions/transaction-routes.ts` |
| Scheduler/queue | `apps/api/src/scheduler/scheduler-service.ts`, `apps/api/src/scheduler/*.worker.ts`, `apps/api/src/scheduler/queues.ts` |
| Telegram | `apps/api/src/notifications/telegram.ts`, `apps/api/src/notifications/telegram-routes.ts` |
| Base RPC/Basescan | `apps/api/src/blockchain/*.ts` |
| Web API client | `apps/web/lib/api.ts` |
| Web shell/status badges | `apps/web/components/app-shell.tsx` |
| Wallet UI | `apps/web/app/(app)/wallets/`, `apps/web/components/wallet*.tsx` |
| Transaction UI | `apps/web/app/(app)/transactions/`, `apps/web/components/transactions-table.tsx` |
| Telegram UI | `apps/web/app/(app)/settings/telegram/page.tsx`, `apps/web/components/telegram-settings-form.tsx` |

## Missing Expected Folders

| Severity | Status | Missing folder | Impact |
|---|---|---|---|
| HIGH | MISSING | `apps/api/src/auth/` or equivalent | No auth/authorization boundary exists. |
| HIGH | MISSING | `apps/api/src/validation/` or shared route schemas | Manual validation is inconsistent. |
| HIGH | MISSING | `apps/api/src/idempotency/` or transaction lock module | Live duplicate-submit controls are absent. |
| MEDIUM | MISSING | `e2e/` or `apps/web/e2e/` | Browser/demo workflows are not tested end-to-end. |
| MEDIUM | MISSING | `infra/` or production deployment manifests | Server deployment is documented but not implemented. |
| MEDIUM | MISSING | `monitoring/` | No metrics, alerts, or health dashboards. |

## Stale, Duplicate, or Misplaced Files

| Severity | Status | File/folder | Observation | Fix |
|---|---|---|---|---|
| MEDIUM | PARTIAL | `VALIDATION_REPORT.md` | Report appears stale relative to current test inventory after demo additions. | Regenerate after current `pnpm install`, `typecheck`, `lint`, `test`, and `build`. |
| LOW | PARTIAL | `apps/web/.next/` | Generated Next build output exists in the workspace despite `.gitignore` covering `.next/`. | Remove from repo/worktree if accidentally tracked. |
| LOW | PARTIAL | `apps/web/tsconfig.tsbuildinfo` | Generated TypeScript cache exists despite `.gitignore` covering `*.tsbuildinfo`. | Remove from repo/worktree if accidentally tracked. |
| LOW | PARTIAL | `.env.example` | Comment says vault import exists "once that feature exists"; vault import now exists. | Update wording in a future docs cleanup. |

## Suggested Cleanup Plan

1. Confirm with `git status --short` which generated files are tracked.
2. Remove tracked build artifacts such as `.next/` and `*.tsbuildinfo`.
3. Regenerate `VALIDATION_REPORT.md` after the current codebase validates.
4. Add owner comments or module README files for auth, validation, scheduler, and live transaction responsibilities once implemented.
5. Keep `architecture/`, `plan/`, `docs/`, and `report_md/` as documentation-only folders; avoid mixing generated output into source folders.

