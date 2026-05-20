# Phase Status

## Completed Phases

Phase 0, repository scaffold:

- Monorepo, pnpm workspace, Next.js web app, Fastify API, shared package, safety docs, and base project layout exist.

Phase 1, local development infrastructure:

- Docker Compose defines Postgres, Redis, and optional pgAdmin.
- `.env.example` documents local defaults.
- Root scripts cover install, database startup, migration, seed, dev, lint, typecheck, and tests.

Phase 5, initial web dashboard:

- Dashboard shell, navigation, wallets, wallet detail, tokens, pairs, transactions, settings, Telegram settings, security settings, docs page, and loading states exist.

Phase 6, management APIs and risk controls:

- Token, pair, router, and wallet-pair-rule APIs exist.
- Enablement policy checks are implemented and tested.
- Management UI is connected to these APIs.

Phase 7, dry-run planner:

- `POST /api/plans/dry-run` creates `DRY_RUN` or `REJECTED` transaction rows.
- Planner uses quote provider data and risk modules.
- Mock quote provider is default.
- 0x provider scaffold exists.

Phase 8, Telegram notifications:

- Settings API, encrypted bot token storage, test send, message formatting, and notification preferences exist.
- Dry-run, execute-once, approval/revoke, confirmation, scheduler risk pause, and emergency pause notification paths exist.

Phase 9, manual live execute once:

- `POST /api/trades/execute-once` exists.
- Live writes are gated by environment, request confirmation, risk checks, router/allowance whitelists, simulation, and quote calldata.
- Submitted, rejected, and failed outcomes create transaction records.

Phase 10, ERC20 approval management:

- Allowance reads, exact approval, revoke-to-zero, approval policy, and UI panel exist.
- Unlimited approval and auto-approval are disabled by default.

Phase 11, BullMQ scheduler:

- Redis-backed queues and workers exist.
- Scheduler start/stop/status endpoints exist.
- Wallet schedule configuration and emergency pause exist.
- Scheduled dry-runs are supported.
- Confirmation and notification jobs are wired.

Phase 12, transaction confirmation watcher:

- Receipt refresh updates submitted transactions to confirmed or failed.
- Daily wallet stats and Telegram notification paths are wired.
- Manual refresh and transaction detail UI exist.

Phase 13, wallet profiles and bulk onboarding:

- Profiles, bulk wallet status actions, profile application, encrypted backup export/import, and backup safety checks exist.

Phase 14, validation and test coverage:

- Root scripts now include `test`, `test:unit`, `test:integration`, `typecheck`, `lint`, `build`, and `validate`.
- API scripts now expose unit and integration test slices.
- Unit coverage includes encryption/decryption, Basescan link builders, risk engine checks, Telegram message formatting, token/pair validation, approvals, scheduler policy, planner behavior, confirmations, profiles, quotes, and encrypted backups.
- Integration coverage includes wallet import with encrypted key storage, dry-run plan route transaction creation, Telegram settings save with encrypted token storage, and transaction Basescan link generation.
- `VALIDATION_REPORT.md` was created after running install, typecheck, lint, test, and build.

Phase A, critical security controls:

- Central Zod-backed runtime config exists in `apps/api/src/config`.
- Local single-operator auth, HTTP-only session cookie, and CSRF middleware exist in `apps/api/src/auth`.
- Dashboard login and logout flow exists.
- Vault lock/unlock/status API exists, and live signing routes reject while locked.
- Global emergency pause API and UI exist, and live-impacting routes reject while paused.

Phase B, dry-run completeness and API contracts:

- Shared Zod schemas exist under `packages/shared/src/schemas` and validate wallet, token, pair, router, trade, approval, Telegram, and scheduler request bodies.
- Token amount parsing/formatting uses bigint-safe utilities in `packages/shared/src/amounts.ts`.
- Quote normalization now carries explicit `sellAmountDisplay`, `sellAmountRaw`, `buyAmountDisplay`, `buyAmountRaw`, `quotedAt`, and `expiresAt` fields.
- Dry-run risk checks include price impact when supplied by quotes and stale quote expiry.
- Web read APIs return structured error objects; dashboard and wallets show API error states separately from empty states.

Phase C, operator safety UX:

- `/api/runtime/status` exposes demo, dry-run, live gating, vault, emergency-pause, auth, quote provider, and masked RPC status for the dashboard shell.
- Dashboard header and banners use runtime status instead of web build-time environment variables.
- Dangerous web actions require confirmation modals, with typed confirmation for approve, revoke, execute once, router enablement, encrypted backup export, and scheduler start.
- Demo Basescan links are labeled with a `DEMO` badge and tooltip.
- Dashboard panels now surface approval exposure, pending transactions, recent rejections, and risk limits with honest partial-state messaging.
- Playwright E2E scaffolding covers login, dashboard safety badges, wallet detail, transaction history, demo Basescan labeling, Telegram settings, and dry-run execute blocking.

Phase D, Telegram auditability and observability foundation:

- API responses include an `x-request-id` header and Fastify logs carry request correlation.
- Notification delivery audit rows record Telegram `SENT`, `FAILED`, and `SKIPPED` outcomes with request/job correlation and redacted error metadata.
- Telegram test sends and notification sends have local in-memory rate limiting.
- Telegram messages include mode, Base chain, request ID, job ID when available, wallet short address, transaction link when available, and explicit dry-run/rejected no-send text.
- Telegram settings UI shows disabled/token/chat states, last test status, last delivery timestamp, and recent delivery rows.
- `/api/ops/summary` exposes queue depth when available, notification failures, submitted/failed transaction counts, emergency pause, vault, and runtime status.

Phase I, final live readiness hardening:

- Universal route validation now covers auth login, vault unlock, encrypted backup import, route params, no-body mutation contracts, and idempotency/CSRF expectations.
- Operator UI read paths preserve API error states instead of collapsing failures into empty data.
- Dangerous actions now use confirmation modals with typed confirmation for emergency pause enable/disable, vault unlock, backup export/import, router enable, high-risk token enable, pair enable, wallet activation, approve, revoke, execute-once, scheduler start, and scheduler purge.
- Transaction confirmation policy now models `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, `FINALIZED`, `FAILED`, `STUCK`, `DROPPED`, and reserved `REPLACED`.
- Same-wallet live writes reject while a submitted, pending-finality, or stuck transaction exists.
- Ops summary, route validation, confirmation finality, pending-wallet lock, and web API error tests exist.

## Partial Phases

Phase 2, database schema:

- Complete in code and migrations.
- Partial because migrations and seed still need to be run in the target local environment before runtime claims are made.

Phase 3, wallet vault:

- Complete in code and unit tests.
- Partial until private-key import and encrypted backup restore are exercised with operator-owned dedicated wallets in a local database.

Phase 4, Base read-only client:

- Complete in code.
- Partial until chain status, balances, and Basescan links are verified against the configured `BASE_RPC_URL`.

Phase 8, Telegram notifications:

- Complete in code.
- Partial until a real BotFather token and chat ID are tested locally.

Phase 9, manual live execute once:

- Guarded implementation complete.
- Partial until verified token/router addresses, quote calldata, allowance setup, gas behavior, and a funded dedicated wallet are tested on Base.

Phase 10, ERC20 approval management:

- Guarded implementation complete.
- Partial until allowance reads, exact approval, revoke, and confirmation refresh are tested against verified Base contracts.

Phase 11, BullMQ scheduler:

- Scheduled dry-run behavior complete in code.
- Partial until start/stop and queue processing are run against local Redis and seeded Postgres.
- Live scheduled execution is intentionally absent.

Phase 12, confirmation watcher:

- Complete in code.
- Partial until run against real submitted transaction hashes.

Phase 14, validation and test coverage:

- Complete for local automated validation.
- Partial for live-network validation because integration tests intentionally avoid requiring Docker, Postgres, Redis, Telegram network calls, or funded Base wallets.

Phase C, operator safety UX:

- Complete for the main dashboard and wallet operator flows.
- Partial for exhaustive E2E coverage; modal happy paths and API-offline simulation remain future tests.

Phase D, Telegram auditability and observability foundation:

- Complete for local auditability and JSON summary observability.
- Partial for production monitoring; metrics are not yet exported to Prometheus/OpenTelemetry and rate limiting is process-local.

## Failed Or Blocked Items

- Live scheduled execution: blocked by design; `trade.worker.ts` throws for `LIVE` jobs.
- Native ETH value swaps: blocked because execute-once currently sends `value=0`.
- Public/server deployment: still blocked until TLS/reverse proxy, stronger secret storage, monitoring, backup automation, and live transaction hardening are implemented.
- Token/router live enablement: blocked until Base Mainnet contract addresses and decimals are independently verified.
- 0x live quote execution: blocked until 0x endpoint, API key, response schema, router/allowance targets, and calldata behavior are verified.
- Nonce management: partial; same-wallet live writes are serialized and nonce metadata is stored when available, but automatic replacement/cancel flows are not implemented.
- Idempotency keys: implemented for live writes; continue to avoid repeated live clicks outside the UI.
- Quote calldata semantic decoding: not implemented; live remains blocked until router function, recipient, min-out, and native value semantics are deeply validated.
- PnL/real daily loss accounting: not implemented; `estimatedLossUsd` is not updated by a real portfolio engine.
- Seed phrase import: intentionally unsupported and must remain blocked.
