# System Architecture And Data Flow

Date: 2026-05-20

Scope: End-to-end architecture and flows across web, API, auth, vault, dry-run, quotes, approvals, execute-once, confirmations, scheduler, notifications, ops, and deployment.

Verdict/status: PARTIAL. The local dry-run architecture is clear and implemented. Live execution exists but remains tiny/manual only after operator gates. Live automation is missing by design.

## High-Level Architecture

`apps/web` is a Next.js dashboard. `apps/api` is a Fastify API. `packages/shared` provides shared constants and Zod schemas. Postgres stores wallets, token/router/pair config, transactions, request ids, locks, schedules, notifications, audit logs, and aggregate risk data. Redis supports BullMQ queues, rate limiting, and production sessions when configured.

## Web To API Flow

- IMPLEMENTED: `apps/web/lib/api.ts` chooses browser API base URL from `NEXT_PUBLIC_API_BASE_URL` and server API base URL from `INTERNAL_API_BASE_URL`.
- IMPLEMENTED: Server components forward cookies with `next/headers`.
- IMPLEMENTED: Unsafe API requests fetch CSRF token first, then send `x-csrf-token`.
- PARTIAL: Web error handling is functional, but some pages fall back to empty arrays after API errors and rely on visible error cards only at top-level reads.

## Auth, Session, CSRF Flow

- IMPLEMENTED: `POST /api/auth/login` validates body, rate-limits by IP and username, verifies operator password, creates session, and sets HTTP-only cookie.
- IMPLEMENTED: `POST /api/auth/logout` deletes session and clears cookie.
- IMPLEMENTED: `GET /api/auth/me` is public and returns authenticated state.
- IMPLEMENTED: CSRF required for mutating `/api` routes except login.
- PARTIAL: CORS allows only local web origins derived from configured `WEB_PORT`.

## Wallet Vault Flow

- IMPLEMENTED: Wallet import validates private-key format in shared schema, derives address, encrypts private key, and stores encrypted payload.
- IMPLEMENTED: AES-256-GCM payload includes version, IV, auth tag, and ciphertext.
- IMPLEMENTED: `MASTER_KEY_FILE` is loaded or created as 32 bytes with best-effort file permissions.
- IMPLEMENTED: Live signing routes require vault unlock when `DRY_RUN=false` and `DEMO_MODE=false`.
- PARTIAL: Local-file vault is the active implemented custody path; KMS/external signer providers are scaffolded/roadmap-level.

## Dry-Run Flow

- IMPLEMENTED: `POST /api/plans/dry-run` loads wallet, pair, tokens, routers, wallet-pair rule, daily stats, and quote.
- IMPLEMENTED: `planDryRunTrade` checks wallet status, pair/rule enabled state, token/router verification, limits, gas, slippage, price impact, and quote freshness.
- IMPLEMENTED: Accepted and rejected dry-runs create transaction rows.
- IMPLEMENTED: Dry-run never decrypts private keys, signs, or submits transactions.

## Quote Flow

- IMPLEMENTED: `QUOTE_PROVIDER=mock` is default and offline.
- IMPLEMENTED: `QUOTE_PROVIDER=zeroX` calls 0x allowance-holder quote endpoint and normalizes response.
- IMPLEMENTED: `normalizedQuoteSchema` validates chain id, token addresses, raw amounts, gas fields, transaction target/calldata/value, timestamps, and expiry.
- PARTIAL: 0x provider sets price impact to `null` and slippage to static `100`; live behavior is not validated here.

## Approval/Revoke Flow

- IMPLEMENTED: `GET /api/wallets/:id/allowances` reads token/router allowance matrix where addresses are verified.
- IMPLEMENTED: `POST /api/wallets/:id/approve` requires idempotency key, no pending live transaction, emergency pause off, vault unlock for live signing, exact positive amount, and live confirmation.
- IMPLEMENTED: `POST /api/wallets/:id/revoke` uses ERC20 `approve(spender, 0)`.
- IMPLEMENTED: Unlimited approval is blocked unless `ALLOW_UNLIMITED_APPROVAL=true`.
- PARTIAL: Approval and revoke transaction rows do not record nonce/from/to/calldata hash as richly as swap execute-once.

## Execute-Once Flow

- IMPLEMENTED: `POST /api/trades/execute-once` rejects early in demo/dry-run or without confirmation.
- IMPLEMENTED: Uses idempotency key and per-wallet lock.
- IMPLEMENTED: Gets quote, hashes quote and calldata, evaluates trade risk and live quote safety, checks allowance, optionally auto-approves only if explicitly enabled, simulates with `basePublicClient.call`, decrypts key, and sends transaction.
- PARTIAL: Aggregate risk is not clearly enforced in this live route before signing.
- PARTIAL: Native value swaps are disabled by default; execution supports `txValue` only if config permits.

## Confirmation/Finality Flow

- IMPLEMENTED: `refreshTransactionConfirmation` maps receipts to `CONFIRMED_PENDING_FINALITY`, `FINALIZED`, or `FAILED`.
- IMPLEMENTED: Missing receipts age into `STUCK` or `DROPPED` with operator review messages.
- PARTIAL: Reorg and replacement detection is operator-guided, not automated.
- IMPLEMENTED: Finalized/failed status updates request status and releases wallet lock.

## Scheduler Flow

- IMPLEMENTED: BullMQ queues exist for quote, trade, confirmation, and notification.
- IMPLEMENTED: Scheduler lock table provides owner/heartbeat/expires state.
- IMPLEMENTED: Scheduler starts dry-run jobs for eligible schedules and blocks duplicate pending schedule jobs.
- MISSING: Live scheduler execution throws intentionally in service and worker code.
- PARTIAL: Attempts are set to 1; there is no robust dead-letter/retry/backoff policy.

## Telegram/Notification Flow

- IMPLEMENTED: Telegram settings store encrypted bot token and chat id.
- IMPLEMENTED: Notifications record delivery attempts in `notification_deliveries`.
- IMPLEMENTED: Events include dry-run accepted/rejected, transaction submitted/confirmed/failed/rejected, wallet pause, emergency pause, stuck/dropped alert webhooks.
- PARTIAL: Telegram delivery failures generally do not block business operations.

## Ops/Monitoring Flow

- IMPLEMENTED: `/health`, `/api/runtime/status`, `/api/ops/summary`, `/metrics`.
- IMPLEMENTED: Metrics include auth failures, vault state, emergency pause, queue depth, scheduler jobs, notification deliveries, RPC health, and alert webhook counters.
- PARTIAL: `/metrics` is open when `METRICS_TOKEN` is unset, acceptable only for local/private access.

## Deployment Flow

- IMPLEMENTED: Local Compose starts Postgres and Redis.
- IMPLEMENTED: Production example includes api, web, nginx, Postgres, Redis, volumes, healthchecks.
- PARTIAL: Production example defaults remain demo/dry-run and placeholders.
- PARTIAL: Server exposure requires real TLS certs, real secrets, non-local Redis, and custody upgrade before meaningful funds.

## Architecture Gaps

- HIGH / PARTIAL: Aggregate risk is not a uniform live pre-signing gate.
- HIGH / MISSING: Live scheduler architecture remains design-only.
- HIGH / PARTIAL: Replacement/cancel/reorg handling requires operator review.
- HIGH / PARTIAL: Custody is local-file and not production-grade.
- MEDIUM / PARTIAL: Server security posture needs stronger auth, secrets management, and telemetry hardening.
