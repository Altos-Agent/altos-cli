# API Review
Date: 2026-05-08
Repository audit scope: Fastify routes, input validation, unsafe routes, auth assumptions, errors, rate limiting, response consistency, and secret exposure.
Verdict/status: PARTIAL. API coverage is broad, but security and validation are not live-ready.

## API Route Inventory

| Route group | Status | Examples |
|---|---|---|
| Health/chain | IMPLEMENTED | `GET /health`, `GET /api/chain/status`, wallet balance/Basescan endpoints |
| Wallets | IMPLEMENTED | `GET /api/wallets`, `POST /api/wallets/import`, status/profile/backup/delete routes |
| Profiles | IMPLEMENTED | `GET /api/profiles` |
| Tokens/pairs/routers | IMPLEMENTED | CRUD-like management and enable/disable routes |
| Wallet pair rules | IMPLEMENTED | `GET/PUT /api/wallets/:id/pair-rules` |
| Dry-run plans | IMPLEMENTED | `POST /api/plans/dry-run`, quote preview |
| Live trades | PARTIAL | `GET /api/trades/live-status`, `POST /api/trades/execute-once` |
| Approvals | PARTIAL | allowance list, approve, revoke |
| Transactions | IMPLEMENTED | list/detail/refresh |
| Telegram | IMPLEMENTED | settings get/update/test |
| Scheduler | PARTIAL | status/start/stop/schedule/emergency pause |

## Missing Routes

| Severity | Status | Missing route | Why |
|---|---|---|---|
| CRITICAL | MISSING | Auth/session routes | Required before live or server deployment. |
| HIGH | MISSING | Global emergency pause | Wallet-level pause exists; app-wide kill switch should block all live writes. |
| HIGH | MISSING | Live mode config route with explicit operator policy | Environment-only live switching is brittle. |
| MEDIUM | MISSING | Queue job history and failed job inspection | Needed for operations. |
| MEDIUM | MISSING | Vault lock/unlock/status | Required for safe live signing. |

## Unsafe Routes

| Severity | Route | Risk | Required fix |
|---|---|---|---|
| CRITICAL | All mutating routes | No authentication/authorization. | Add auth middleware and route policy. |
| HIGH | `/api/trades/execute-once` | Could submit live tx if env gates are changed. | Require auth, idempotency key, vault unlock, and route schema. |
| HIGH | `/api/wallets/:id/approve` and `/revoke` | Can submit live approval/revoke if env gates are changed. | Same as above plus approval-specific limits. |
| HIGH | Management enable routes | Can enable unsafe tokens/pairs/routers. | Add operator confirmation, address validation, and audit before/after. |
| MEDIUM | `/api/scheduler/stop` | Drains queues and can delete pending work. | Replace drain behavior with graceful worker close or explicit purge route. |

## Input Validation

Status: PARTIAL. Many services manually check fields, but there is no central schema validation. Missing route-level schemas allow malformed body shapes to reach service code.

Required fix: add Zod/TypeBox schemas for all route params/body/query, reuse inferred DTOs in `apps/web/lib/types.ts`, and validate before service calls.

## Auth Assumptions

The API assumes local-only trusted access. This is acceptable for a single-user demo on `127.0.0.1`, but not safe for shared machines, browser extensions, local malware, LAN binding, containers exposed to host networks, or remote deployment.

## Error Handling

Status: PARTIAL. Route modules usually catch domain errors and return status codes. Some blockchain errors are intentionally generic. Missing: request IDs, structured error codes, and redacted internal details for support/debugging.

## Rate Limiting

Status: MISSING. No rate limiting exists. This matters for import, Telegram test, quote, approval, live execute, and scheduler start/stop endpoints.

## Response Shape Consistency

Status: PARTIAL. Many responses are coherent, but `safeFetchJson` on web hides non-OK API failures by returning null/default empty arrays. This can obscure backend failures in UI.

## Secrets Exposure Risks

Positive: wallet responses are sanitized and Telegram settings return only token preview. Logger redaction covers private keys and bot tokens.

Remaining risks: backup export intentionally exposes encrypted wallet ciphertext; unauthenticated API can trigger backup export if route is reachable; no auth makes this high risk.

## Suggested API Improvements

| Severity | Improvement | Acceptance criteria |
|---|---|---|
| CRITICAL | Add auth/session/CSRF. | All write routes reject unauthenticated requests. |
| HIGH | Add schemas. | Invalid address/decimals/body tests pass for every route. |
| HIGH | Add idempotency middleware for live writes. | Repeated request key returns same result. |
| MEDIUM | Add rate limits. | Telegram test and live endpoints cannot be spammed. |
| MEDIUM | Add request IDs and error codes. | Every response/log/audit entry can be correlated. |

