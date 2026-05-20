# API Validation And Backend Code Review

Date: 2026-05-20

Scope: API route inventory, schema coverage, params/query/body/header validation, error handling, request IDs, rate limits, response consistency, backend boundaries, unsafe endpoints, and API tests.

Verdict/status: PARTIAL. API validation and module boundaries are strong for local use. Public/server hardening and uniform live-risk enforcement need more work.

## API Route Inventory

Implemented route groups:

- Auth: `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/csrf`.
- Vault: `/api/vault/status`, `/api/vault/unlock`, `/api/vault/lock`.
- Emergency pause: `/api/emergency-pause`, `/api/emergency-pause/enable`, `/api/emergency-pause/disable`.
- Runtime/ops: `/health`, `/api/runtime/status`, `/api/ops/summary`, `/metrics`.
- Chain: `/api/chain/status`, wallet balances, Basescan links.
- Management: `/api/tokens`, `/api/pairs`, `/api/routers`, `/api/wallets/:id/pair-rules`.
- Wallets: list/detail/import/bulk/profile/status/backup/delete.
- Planner/quotes: `/api/plans/dry-run`, `/api/quotes`.
- Trades: `/api/trades/live-status`, `/api/trades/execute-once`.
- Approvals: `/api/wallets/:id/allowances`, `/api/wallets/:id/approve`, `/api/wallets/:id/revoke`.
- Transactions: list/detail/requests/pending/refresh.
- Scheduler: status/start/pause/stop/purge/wallet schedule/wallet emergency pause.
- Telegram: settings get/put/test.
- Risk: aggregate status/stats/limits/update/refresh.

## Schema Validation Coverage

- IMPLEMENTED: Shared Zod schemas cover most route bodies in `packages/shared/src/schemas`.
- IMPLEMENTED: `parseRequestBody`, `parseIdParams`, and `assertNoRequestBody` centralize validation.
- IMPLEMENTED: Integration tests in `apps/api/src/schemas/route-validation.integration.test.ts` cover invalid auth body, vault unlock body, encrypted backup import, invalid route params, and unexpected bodies.
- PARTIAL: Some service-level checks enforce domain semantics after broad route validation, such as token/router live verification and pair enablement policy.

## Params, Query, Body, Header Coverage

- IMPLEMENTED: Route ids use `idParamsSchema`.
- IMPLEMENTED: Mutating no-body routes explicitly reject request bodies.
- IMPLEMENTED: Live-write endpoints require `Idempotency-Key` header via `requireIdempotencyKey`.
- PARTIAL: `Idempotency-Key` length is capped but format/entropy is not enforced.
- PARTIAL: Query validation is minimal because most routes do not expose query filters.

## Error Handling

- IMPLEMENTED: Domain errors map to status codes in route modules.
- IMPLEMENTED: Validation errors return 400 with validation message.
- IMPLEMENTED: API logger redacts key, token, cookie, and authorization fields.
- PARTIAL: Several catch blocks intentionally hide low-level error detail, which protects secrets but can limit operator diagnosis.

## Request IDs

- IMPLEMENTED: Request context is installed in `apps/api/src/http/request-context.ts`.
- IMPLEMENTED: Audit metadata includes request id for management and scheduler updates.
- IMPLEMENTED: Tests verify request ID header on Telegram route.
- PARTIAL: Request id propagation into every transaction/notification/alert path is improving but not uniformly visible in all route responses.

## Rate Limiting On Sensitive Endpoints

- IMPLEMENTED: Login rate limiting.
- IMPLEMENTED: Telegram test send rate limiting exists based on tests.
- PARTIAL: Vault unlock, execute-once, approve, revoke, scheduler start, backup export/import, and emergency pause need explicit route-level rate limits for public/server use.

## Response Consistency

- IMPLEMENTED: Live write results commonly return `accepted`, `rejected`, `reasons`, `status`, `transactionId`.
- PARTIAL: Rejected live writes often return HTTP 200 with `rejected: true`, which is deliberate operator feedback but requires frontend/client discipline.
- PARTIAL: Some API read failures are converted into UI fallback empty arrays in web pages.

## Backend Module Boundaries

- GOOD: `server.ts` composes routes but most business logic is in modules.
- GOOD: `wallet-service`, `approval-service`, planner, transaction manager, scheduler service, and notification service are separated.
- PARTIAL: Direct private-key signing logic appears in both approval service and trade route; it should eventually be unified behind custody provider interface.

## Unsafe Or Unclear Endpoints

- HIGH / PARTIAL: `/api/trades/execute-once` lacks clear aggregate-risk enforcement before signing.
- MEDIUM / PARTIAL: `/metrics` open when no token is configured.
- MEDIUM / PARTIAL: Backup export/import routes are powerful and need explicit rate limits, audit views, and operator confirmations.
- MEDIUM / PARTIAL: Management routes can enable tokens/routers/pairs but do not require typed confirmation at API level.

## Tests Covering API

- IMPLEMENTED: API tests pass: 36 test files, 149 tests.
- IMPLEMENTED: Coverage includes auth/CSRF, env config, route validation, wallet import, vault lock, live gates, idempotency, planner, quote validation, approvals, scheduler, confirmations, ops, Telegram, aggregate risk, migrations.
- PARTIAL: No live Base integration tests were run.
- PARTIAL: E2E was not run in this audit due report-only write boundary.

## Required Fixes

- Enforce aggregate risk in manual live execute-once and future live workers.
- Add rate limits to all sensitive mutating endpoints.
- Require metrics token in production.
- Move signing behind custody provider abstraction.
- Add typed confirmation or server-side confirmation phrases for management enablement routes.

## Acceptance Criteria

- Every live-impacting route has auth, CSRF, idempotency where relevant, rate limit, audit log, and test coverage.
- Manual live execute-once refuses if aggregate pending/daily/global limits are exceeded.
- Production config fails closed for missing metrics token and Redis-backed rate/session stores.
