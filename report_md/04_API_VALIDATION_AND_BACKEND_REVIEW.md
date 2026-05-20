# API Validation And Backend Review

Date: 2026-05-13  
Scope: Fastify route inventory, validation, auth protection, errors, rate limiting, request IDs, response consistency, backend quality, and API tests.  
Verdict/status: IMPLEMENTED for local API behavior; PARTIAL for production hardening.

## API Route Inventory

| Area | Routes | Status |
| --- | --- | --- |
| Health/auth | `GET /health`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/auth/csrf` | IMPLEMENTED |
| Runtime/ops | `GET /api/runtime/status`, `GET /api/ops/summary` | IMPLEMENTED |
| Vault | `GET /api/vault/status`, `POST /api/vault/unlock`, `POST /api/vault/lock` | IMPLEMENTED |
| Emergency pause | `GET /api/emergency-pause`, `POST /enable`, `POST /disable` | IMPLEMENTED |
| Chain | `/api/chain/status`, wallet balances/Basescan/pending | IMPLEMENTED |
| Wallets | list/get/import/export/import-backup/bulk/profile/status/delete/emergency | IMPLEMENTED |
| Tokens/pairs/routers/rules | CRUD-ish management routes and wallet-pair rules | IMPLEMENTED |
| Planner/quotes | `POST /api/plans/dry-run`, `POST /api/quotes` | IMPLEMENTED |
| Trades | `GET /api/trades/live-status`, `POST /api/trades/execute-once` | IMPLEMENTED |
| Approvals | wallet allowances, approve, revoke | IMPLEMENTED |
| Transactions | list, requests, get, refresh | IMPLEMENTED |
| Scheduler | status/start/pause/stop/purge, wallet schedule, wallet emergency pause | IMPLEMENTED |
| Telegram | get/update/test settings | IMPLEMENTED |
| Profiles | `GET /api/profiles` | IMPLEMENTED |

## Input Validation Coverage

Shared Zod schemas live under `packages/shared/src/schemas/*`. API route helpers in `apps/api/src/http/validation.ts` parse bodies and ID params. Tests in `apps/api/src/schemas/route-validation.integration.test.ts` cover invalid token decimals, malformed dry-run bodies, invalid pair limits, invalid login, invalid vault unlock, invalid encrypted backup import, invalid route params, and unexpected bodies.

## Param / Query / Body / Header Schema Coverage

| Surface | Status | Evidence |
| --- | --- | --- |
| Body schemas | IMPLEMENTED | shared schemas and `parseRequestBody` |
| ID params | IMPLEMENTED | `parseIdParams` |
| Empty body rejection | IMPLEMENTED | `assertNoRequestBody` |
| Idempotency header | PARTIAL | manually required/validated in transaction manager |
| Query schemas | UNCLEAR | few query-heavy routes observed |
| Header schema framework | PARTIAL | no generic header schema layer |

## Auth-Protected Vs Public Route Assessment

Public routes are intentionally limited to health, login, and auth-me. All other `/api/*` routes require session, and unsafe methods require CSRF. This is suitable for local-first use. Public exposure needs stronger password hashing, login throttling, TLS, and secret management.

## Error Handling

Validation errors return 400 with details. Auth returns 401/403. Vault lock/live blocked paths use clear status codes such as 423. Many route services translate domain errors to JSON `{ error }`. Web read APIs convert failures into structured `ApiErrorResult` and UI `ErrorState`.

## Rate Limiting

`apps/api/src/http/rate-limit.ts` provides local in-memory limiting and is used by Telegram test/notification paths. Login does not appear rate-limited. In-memory limiting is not distributed and is insufficient for public deployment.

## Request IDs

`apps/api/src/http/request-context.ts` adds `x-request-id` and async request context. Telegram and operations flows can carry request/job IDs. Integration tests verify request ID headers in Telegram route tests.

## Response Consistency

Most routes return JSON objects or typed arrays. Rejected execute-once uses a 200 response with rejected status for expected policy rejections. Errors are generally `{ error }`. Some endpoint-specific shapes differ, which is acceptable locally but should be documented for clients before external API use.

## Remaining Unsafe Or Inconsistent Endpoints

| Severity | Finding | Status |
| --- | --- | --- |
| HIGH | Login lacks durable rate limit and adaptive password hash | PARTIAL |
| MEDIUM | Header/query validation is not centralized | PARTIAL |
| MEDIUM | Idempotency is header-based and manually handled per live-impacting flow | IMPLEMENTED but narrow |
| MEDIUM | Production API contracts are not versioned | MISSING |

## Backend Code Quality

Backend modules are split by domain and have focused tests. Safety gates are explicit and conservative. The largest quality risk is the dirty/uncommitted worktree and migration metadata state, not obvious code organization.

## Tests Covering API Behavior

`pnpm test` passed 31 API test files and 109 API tests, including auth/CSRF, env validation, route validation, vault, wallet import, encrypted backup, planner, quote validation, live execution, idempotency, approvals, emergency pause, finality, scheduler, Telegram, ops, and Basescan link behavior.

