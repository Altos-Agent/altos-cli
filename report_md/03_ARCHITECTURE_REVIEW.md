# Architecture Review
Date: 2026-05-08
Repository audit scope: API/web/shared boundaries, data flow, transaction flow, notification flow, scheduler flow, and intended versus actual architecture.
Verdict/status: PARTIAL. The local-demo architecture is coherent; the live automation architecture is incomplete.

## Current Architecture

| Layer | Status | Current implementation |
|---|---|---|
| Web | IMPLEMENTED | Next.js app in `apps/web` uses server components plus client controls. API calls are centralized in `apps/web/lib/api.ts`. |
| API | IMPLEMENTED | Fastify app in `apps/api/src/server.ts` registers route modules for wallets, plans, trades, approvals, transactions, Telegram, scheduler, profiles, chain, and management. |
| Shared | PARTIAL | `packages/shared/src/index.ts` contains constants and lightweight types. Shared validation schemas are missing. |
| Database | IMPLEMENTED | Drizzle schema and migrations define wallets, tokens, pairs, routers, transactions, Telegram settings, audit logs, stats, and schedules. |
| Queue | PARTIAL | BullMQ workers exist for quote, trade, confirmation, and notification jobs, but scheduling recurrence is limited and live scheduled execution is blocked. |
| Blockchain | PARTIAL | Base RPC, viem clients, quote providers, allowance reads/writes, and execute-once path exist. Production-grade nonce/idempotency/finality handling is missing. |

## Intended Architecture Inferred From Docs and Code

The intended product is a local-first wallet automation dashboard where operators import encrypted wallets, enable safe token/pair/router policies, run dry-run plans, optionally submit exact approvals or a manually confirmed execute-once live swap, receive Telegram notifications, and eventually schedule guarded trades.

This is supported by `architecture/00-system-map.md`, `architecture/02-transaction-flow.md`, `docs/OPERATIONS_RUNBOOK.md`, and the API modules under `apps/api/src`.

## API/Web/Shared Boundaries

| Boundary | Status | Review |
|---|---|---|
| Web to API | PARTIAL | Clear API client exists, but no auth/session, CSRF protection, request tracing, or typed contract generation. |
| API to DB | IMPLEMENTED | Drizzle gives typed schema access. Some DB constraints exist, but indexes and check constraints are limited. |
| API to blockchain | PARTIAL | Blockchain operations are isolated by modules, but live execution needs stronger transaction manager boundaries. |
| API to shared | PARTIAL | Shared package is small; validation, DTOs, and status enums remain duplicated or informal. |

## Data Flow

1. Web pages call `apps/web/lib/api.ts`.
2. Fastify routes validate minimally and call services.
3. Services read/write Postgres through Drizzle.
4. Vault functions encrypt/decrypt secrets using `.local/master.key`.
5. Blockchain modules call Base RPC and 0x when configured.
6. Transaction rows and audit logs capture state changes.
7. Telegram service decrypts bot token only when sending.

## Transaction Flow

| Flow | Status | Owner files |
|---|---|---|
| Dry-run plan | IMPLEMENTED | `apps/api/src/strategy/plan-routes.ts`, `apps/api/src/strategy/planner.ts` |
| Quote | PARTIAL | `apps/api/src/quote/quoteEngine.ts`, `apps/api/src/quote/providers/*.ts` |
| Approval | PARTIAL | `apps/api/src/approvals/approval-service.ts` |
| Execute once | PARTIAL | `apps/api/src/trades/trade-routes.ts`, `apps/api/src/trades/live-execution.ts` |
| Scheduled trade | PARTIAL | `apps/api/src/scheduler/trade.worker.ts`, `apps/api/src/scheduler/scheduled-dry-run.ts` |
| Confirmation | PARTIAL | `apps/api/src/transactions/confirmation.ts` |

## Notification Flow

Telegram settings are stored in `telegram_settings`. The bot token is encrypted with the same vault key used for wallet secrets. Notifications are sent by `apps/api/src/notifications/telegram.ts` from dry-run, live transaction, approval, confirmation, scheduler risk pause, and emergency pause paths. Event coverage is useful but not exhaustive.

## Gaps Between Intended and Actual Architecture

| Severity | Status | Gap | Recommended fix |
|---|---|---|---|
| CRITICAL | MISSING | No authentication/authorization layer. | Add local auth, session middleware, CSRF, and role/route policy. |
| HIGH | MISSING | No dedicated transaction manager for nonces, idempotency, pending state, and retries. | Create a per-wallet transaction service with locks and idempotency keys. |
| HIGH | PARTIAL | Scheduler is not a real recurring production scheduler. | Add recurrence model, distributed lock, non-draining stop, visibility, and live-mode policy. |
| HIGH | PARTIAL | Quote validation is too shallow for live swaps. | Verify quote chain, router, spender, calldata, value, raw amount, min output, slippage, and expiry. |
| MEDIUM | MISSING | Shared DTO/schema contract is absent. | Move schemas/types to shared package and reuse from API and web. |
| MEDIUM | MISSING | Observability architecture is absent. | Add structured audit events, metrics, health probes, and alert paths. |

## Recommended Target Architecture

1. Add an auth boundary before all API routes.
2. Introduce route schema validation shared with the UI.
3. Split live transaction submission into quote validation, approval planning, nonce lock, simulation, signing, submission, and watcher.
4. Keep scheduler dry-run only until the live transaction manager is complete.
5. Move secret handling behind an unlockable vault provider abstraction.
6. Add observability: request IDs, audit IDs, queue metrics, transaction state metrics, and notification failure metrics.
7. Treat production/server deployment as a separate hardening milestone, not a small environment switch.

