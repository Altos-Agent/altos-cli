# Testing and Validation Review
Date: 2026-05-08
Repository audit scope: Existing test inventory, unit/integration/E2E gaps, security tests, dry-run and live guardrail tests, and validation commands.
Verdict/status: PARTIAL. Current test coverage is useful and validation scripts exist, but live-readiness testing is incomplete.

## Existing Test Inventory

Unit and integration tests exist under `apps/api/src/**/*.test.ts` and `apps/api/src/**/*.integration.test.ts`.

Covered areas include:

- Vault encryption/decryption.
- Basescan link builder.
- Risk policy and planner checks.
- Telegram message formatting and encrypted token setting save.
- Token/pair validation policies.
- Wallet import integration using in-memory DB.
- Dry-run plan route integration.
- Transaction history link generation.
- Approval policy.
- Scheduler policy.
- Live execution safety helper.
- Quote engine.
- Profiles.
- Confirmation mapping.
- Encrypted backup.
- Demo data.

## Missing Unit Tests

| Severity | Missing test | Why |
|---|---|---|
| HIGH | Token decimals conversion across trade storage and approval flows. | Prevent wrong raw unit magnitude. |
| HIGH | Quote payload validation failure cases. | Prevent wrong router/spender/chain/call data. |
| HIGH | Live execute route duplicate/idempotency behavior. | Blocks double-submit risks once implemented. |
| MEDIUM | Env validation. | Prevent unsafe live startup. |
| MEDIUM | Router/token address normalization. | Prevent whitelist bypass/config mistakes. |

## Missing Integration Tests

| Severity | Missing test | Why |
|---|---|---|
| HIGH | Real Postgres migration plus service tests. | In-memory adapter cannot catch DB constraint/migration issues. |
| HIGH | Redis/BullMQ scheduler lifecycle tests. | Scheduler behavior depends on Redis and queue semantics. |
| HIGH | Approval and execute-once with mocked viem client. | Live guardrail logic needs route-level tests. |
| MEDIUM | Telegram API failure simulation. | Ensure notification failures are recorded and do not break flows. |
| MEDIUM | Backup/restore drill. | Validate operational recovery. |

## Missing E2E Tests

Status: MISSING. Add Playwright tests for:

1. Demo starts and shows Demo Mode/Dry Run badges.
2. User can open wallet detail.
3. User can see transaction history and demo Basescan links.
4. Telegram settings open, save, and show preview.
5. Execute-once is blocked in demo/dry-run.
6. API unavailable shows error state, not empty success.

## Security Tests Needed

| Severity | Test | Acceptance criteria |
|---|---|---|
| CRITICAL | Unauthenticated writes rejected after auth is added. | All mutating routes require auth. |
| HIGH | Redaction regression. | Private keys/bot tokens never appear in captured logs. |
| HIGH | Vault locked state. | Signing routes reject while locked. |
| HIGH | Unlimited approval default. | Unlimited approvals rejected unless explicitly enabled. |
| HIGH | Demo mode live block. | All live writes reject in `DEMO_MODE=true`. |

## Dry-run Tests Needed

Add cases for disabled token, disabled router, disabled wallet-pair rule, max daily trades reached, max gas exceeded, max slippage exceeded, price impact exceeded once implemented, quote provider failure, and non-finite amount.

## Live-mode Guardrail Tests Needed

Live transaction tests should use mocked viem/RPC only until a dedicated manual live checklist is run. Validate rejection when dry-run is true, demo is true, confirmation missing, router not whitelisted, allowance target not whitelisted, calldata missing, simulation fails, allowance insufficient, and duplicate idempotency key is reused.

## Build/Typecheck/Lint Status

Scripts exist:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm validate`

The existing `VALIDATION_REPORT.md` appears stale relative to current test inventory. Regenerate it after current validation.

## Suggested Validation Matrix

| Command | Required for merge | Required before live |
|---|---:|---:|
| `pnpm install` | Yes | Yes |
| `pnpm typecheck` | Yes | Yes |
| `pnpm lint` | Yes | Yes |
| `pnpm test` | Yes | Yes |
| `pnpm build` | Yes | Yes |
| Playwright E2E | Recommended | Yes |
| Postgres/Redis integration | Recommended | Yes |
| Mocked RPC live guardrail suite | Yes | Yes |
| Manual tiny live test | No | Only after checklist signoff |

