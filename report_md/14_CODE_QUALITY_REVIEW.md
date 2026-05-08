# Code Quality Review
Date: 2026-05-08
Repository audit scope: TypeScript quality, module boundaries, error handling, naming, duplication, dead code, TODO/FIXME inventory, config handling, logging, and maintainability.
Verdict/status: PARTIAL. Code is readable and modular for a prototype, but hardening work should tighten types, schemas, and boundaries.

## TypeScript Quality

Status: PARTIAL. The code uses TypeScript consistently and Drizzle types for DB rows. Some route bodies use inline types or `Parameters<typeof service.method>` instead of explicit DTO schemas. This keeps velocity high but weakens API contracts.

Recommended fix: introduce shared schemas and generated/inferred DTO types for API route bodies and responses.

## Module Boundaries

| Boundary | Status | Review |
|---|---|---|
| API routes vs services | IMPLEMENTED | Mostly clean route/service split. |
| Vault vs wallet service | IMPLEMENTED | Crypto primitives are isolated. |
| Risk vs planner | PARTIAL | Risk checks exist, but some management policies and planner policies are separate. |
| Live transaction manager | MISSING | Execute-once route contains too much orchestration. |
| Web API client | IMPLEMENTED | Centralized in `apps/web/lib/api.ts`. |

## Error Handling

Status: PARTIAL. Domain error classes exist for wallet, management, Telegram, scheduler, approvals, and confirmation. Blockchain errors are often caught and replaced with generic messages, which helps avoid leaks but reduces debuggability.

Fix: add internal redacted error codes and request IDs to audit logs.

## Naming

Generally clear. Improve:

- `preSimulationSafety` currently passes `simulated: true` before actual simulation; rename or restructure to avoid implying simulation already passed.
- `amountIn` sometimes means display USD-like input, sometimes raw units. Use explicit names such as `amountUsd`, `sellAmountDisplay`, and `sellAmountRaw`.
- Pair router references should be `preferredRouterId` instead of name text.

## Duplication

Moderate duplication exists in numeric parsing, live-write rejection reasons, notification payload construction, and route error handling. Consolidate after schemas and transaction manager are introduced.

## Dead Code and TODO/FIXME Inventory

`rg` found TODOs mainly in `apps/api/src/db/seed.ts` warning that Base token/router addresses must be verified before live mode. This is appropriate but should be converted into config metadata and checklist gates.

No obvious large dead module was identified. Generated artifacts in `apps/web/.next` and `apps/web/tsconfig.tsbuildinfo` should not be treated as source.

## Config Handling

Status: PARTIAL. Env variables are read directly across modules. Add centralized config parsing with validation, defaults, and safe startup failure. Critical values: `DRY_RUN`, `DEMO_MODE`, `REQUIRE_LIVE_CONFIRMATION`, `SCHEDULER_LIVE_EXECUTION`, `ALLOW_UNLIMITED_APPROVAL`, `AUTO_APPROVE`, `QUOTE_PROVIDER`, `BASE_RPC_URL`, `MASTER_KEY_FILE`, `REDIS_URL`, `DATABASE_URL`.

## Logging Quality

Fastify redaction is a good start. Logging should add request IDs, job IDs, wallet IDs only where needed, no addresses in high-volume logs unless redacted/shortened, and structured error codes.

## Maintainability Score

| Area | Score | Rationale |
|---|---:|---|
| Local demo maintainability | 8/10 | Clear modules, docs, tests, scripts. |
| Dry-run maintainability | 7/10 | Good foundation, needs schemas and amount clarity. |
| Live transaction maintainability | 4/10 | Needs transaction manager, nonce/idempotency, quote validation. |
| Production operations maintainability | 3/10 | Missing auth, secret manager, monitoring, deployment hardening. |

