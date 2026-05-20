# Operations Runbook

This runbook covers local operations for `base-orchestrator`. The system is dry-run by default. Manual live execution exists only through explicit one-shot requests after live mode is deliberately enabled.

## Run

Start local services:

```bash
pnpm db:up
```

Run migrations and seed:

```bash
pnpm db:migrate
pnpm db:seed
```

Check migration metadata before release builds:

```bash
pnpm --filter @base-orchestrator/api test src/db/migration-metadata.test.ts
pnpm --filter @base-orchestrator/api db:generate
```

`db:generate` should report `No schema changes, nothing to migrate`. If it
creates a new migration unexpectedly, stop and reconcile the Drizzle snapshot
metadata before building or deploying.

Run API and web:

```bash
pnpm dev
```

Default URLs:

- Web: `http://127.0.0.1:3100`
- API: `http://127.0.0.1:4100`
- Postgres: `localhost:5435`
- Redis: `localhost:6379`

Health checks:

```bash
curl http://127.0.0.1:4100/health
```

All `/api/*` routes except auth login/me require an operator session. Use the dashboard login page for normal operation.

Runtime status:

```bash
curl -b /tmp/base-orchestrator.cookies http://127.0.0.1:4100/api/runtime/status
```

The dashboard header reads this endpoint for `DEMO MODE`, `DRY RUN`, vault, emergency-pause, and live-warning badges. If `emergencyPaused=true`, the dashboard shows a red operator banner. If `dryRun=false`, the dashboard shows a strong live-mode warning; this does not bypass vault, auth, confirmation, router, allowance, quote, or emergency-pause gates.

Ops summary:

```bash
curl -b /tmp/base-orchestrator.cookies http://127.0.0.1:4100/api/ops/summary
```

The response includes queue depth when Redis is reachable, notification failure count, submitted/failed transaction counts, emergency-pause status, vault status, and runtime status.

## Deployment Smoke Checks

These checks validate image build and production compose syntax only. They do not enable live mode or start unattended live automation.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
pnpm docker:build:api
pnpm docker:build:web
pnpm docker:compose:prod:check
```

Equivalent compose validation:

```bash
docker compose -f docker-compose.prod.example.yml config
```

Fresh migration smoke for a disposable local database:

```bash
docker compose up -d postgres
docker compose exec -T postgres createdb -U base_orchestrator base_orchestrator_migration_smoke
DATABASE_URL=postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator_migration_smoke \
  DEMO_MODE=true DRY_RUN=true SCHEDULER_LIVE_EXECUTION=false QUOTE_PROVIDER=mock \
  pnpm --filter @base-orchestrator/api db:migrate
DATABASE_URL=postgresql://base_orchestrator:base_orchestrator@localhost:5435/base_orchestrator_migration_smoke \
  DEMO_MODE=true DRY_RUN=true SCHEDULER_LIVE_EXECUTION=false QUOTE_PROVIDER=mock \
  pnpm --filter @base-orchestrator/api db:seed
docker compose exec -T postgres dropdb -U base_orchestrator base_orchestrator_migration_smoke
```

Run `demo:seed` on a separate disposable migrated database when validating demo
data. Do not run `db:seed` and `demo:seed` into the same fresh database unless
the seed ownership rules are updated; both currently seed overlapping token
symbols.

## Authenticated Curl Pattern

Login:

```bash
curl -c /tmp/base-orchestrator.cookies \
  -H 'content-type: application/json' \
  -d '{"username":"operator","password":"change-me-local-only"}' \
  http://127.0.0.1:4100/api/auth/login
```

Fetch CSRF:

```bash
curl -b /tmp/base-orchestrator.cookies http://127.0.0.1:4100/api/auth/csrf
```

For mutating requests, send both the cookie jar and `x-csrf-token` header.

## Stop

Stop web/API dev processes with `Ctrl+C`.

Stop scheduler workers while keeping API up:

```bash
curl -X POST http://127.0.0.1:4100/api/scheduler/stop
```

Stop Docker services:

```bash
pnpm db:down
```

## Backup

Automated drill (run regularly):
```bash
./scripts/drills/backup-restore-demo-drill.sh
```

Manual backup:

Database backup:

```bash
docker exec base-orchestrator-postgres pg_dump -U base_orchestrator base_orchestrator > base_orchestrator.sql
```

Sensitive files to back up securely:

- `.env`
- `.local/master.key` or custom `MASTER_KEY_FILE`
- Encrypted wallet backup JSON files exported by the app

Wallet encrypted backup:

- Use the wallet UI encrypted backup export flow.
- Export contains encrypted private-key payloads only.
- Store separately from the master key when possible.

Never create plaintext private-key CSV backups.

## Restore

Database restore into an initialized local Postgres container:

```bash
docker exec -i base-orchestrator-postgres psql -U base_orchestrator base_orchestrator < base_orchestrator.sql
```

Restore secret files:

- Put `.env` back at repo root.
- Put the original master key at `MASTER_KEY_FILE`.
- Use restrictive local permissions where supported.

Encrypted wallet backup restore:

- Import through the wallet UI or wallet API.
- Matching master-key fingerprint imports wallets as decryptable paused wallets.
- Mismatched master-key imports are rejected by default.
- Explicitly allowed mismatch imports create disabled wallets only.

## Emergency Pause

Automated drill (run regularly):
```bash
./scripts/drills/emergency-pause-drill.sh
```

Global emergency-pause:

```bash
curl -b /tmp/base-orchestrator.cookies \
  -H 'x-csrf-token: <csrf-token>' \
  -X POST http://127.0.0.1:4100/api/emergency-pause/enable
```

Global emergency pause blocks approvals, revokes, execute-once, scheduler start, scheduled jobs, and auto-approval. Disable only after reviewing wallet state, allowances, and submitted transactions.

Emergency-pause one wallet:

```bash
curl -b /tmp/base-orchestrator.cookies \
  -H 'x-csrf-token: <csrf-token>' \
  -X POST http://127.0.0.1:4100/api/wallets/:id/emergency-pause
```

Effects:

- Wallet status becomes `PAUSED`.
- Wallet schedule becomes disabled.
- `emergencyPaused=true`.
- Audit log is written.
- Telegram notification is sent when configured.

After emergency pause:

- Review submitted transactions.
- Refresh confirmations.
- Review ERC20 allowances.
- Revoke allowances if router risk is suspected.
- Keep the wallet paused until limits and configuration are reviewed.

## Import Wallet Locally

```bash
pnpm wallet:import
```

The CLI attempts hidden private-key input. If hidden input is unavailable, use the local UI/API only in a safe environment and avoid logging request bodies.

Imported wallets default to `PAUSED`.

## Quotes And Dry-Runs

Default quote provider:

```bash
QUOTE_PROVIDER=mock
```

Supported providers:

- `mock`: offline and safe for dry-runs, no calldata.
- `zeroX`: calls configured 0x quote endpoint.

Quote:

```bash
curl -X POST http://127.0.0.1:4100/api/quotes \
  -H 'content-type: application/json' \
  -d '{"walletId":"...","pairId":"...","sellAmountDisplay":"10"}'
```

Dry-run:

```bash
curl -X POST http://127.0.0.1:4100/api/plans/dry-run \
  -H 'content-type: application/json' \
  -d '{"walletId":"...","pairId":"...","sellAmountDisplay":"10","mode":"DRY_RUN_ONLY"}'
```

Dry-runs never decrypt private keys, sign transactions, or submit on-chain transactions. Request amounts are decimal strings and are converted to raw token units with the input token decimals. Scientific notation is rejected. Quotes expire after `QUOTE_MAX_AGE_SECONDS` seconds, default `30`.

Live-use quote validation is stricter than display-time quote rendering. Before any live simulation or signing, normalized quote data must prove Base chain `8453`, enabled router/spender, matching sell/buy token addresses, matching raw sell amount, positive raw buy amount, unexpired timestamp, pair slippage and price-impact caps, zero native `txValue` by default, and a whitelisted transaction target. Calldata hashes are stored for audit. Function selector checks are allowlist-based where configured and are not a full router calldata decoder.

## Confirmation And Nonce Operations

Transaction states:

- `SUBMITTED`: hash recorded, receipt/finality not complete.
- `CONFIRMED_PENDING_FINALITY`: receipt succeeded but depth is below `CONFIRMATIONS_REQUIRED`.
- `FINALIZED`: receipt succeeded at required depth.
- `FAILED`: receipt reverted or send/simulation failure was recorded.
- `STUCK`: receipt is still missing past `TX_STUCK_AFTER_MINUTES`; operator review is required.
- `DROPPED`: receipt is still missing past `TX_DROPPED_AFTER_MINUTES`; treat as dropped or replaced until externally verified.
- `REPLACED`: reserved for future reliable replacement detection.

Same-wallet live writes are serialized. Execute-once, approve, and revoke reject while the wallet has a `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, or `STUCK` transaction. The system stores nonce/from-address metadata when available, but it does not send replacement, cancel, or speed-up transactions. Use the wallet detail page and Basescan/provider tools to review stuck or dropped transactions before resuming that wallet.

## Manual Execute Once

Check live status:

```bash
curl http://127.0.0.1:4100/api/trades/live-status
```

Submit one explicit live request:

```bash
curl -X POST http://127.0.0.1:4100/api/trades/execute-once \
  -H 'Idempotency-Key: <unique-request-key>' \
  -H 'content-type: application/json' \
  -d '{"walletId":"...","pairId":"...","sellAmountDisplay":"10","confirmLiveExecution":true}'
```

This is rejected under default `.env.example` because `DRY_RUN=true`. Only enable live mode after completing `plan/02-test-plan.md`.

Native value swaps remain blocked by default:

- `NATIVE_VALUE_SWAPS_ENABLED=false`
- `MAX_NATIVE_VALUE_WEI=0`

Any quote with `txValue > 0` is rejected unless a future phase explicitly enables and tests native-value swap handling.

## ERC20 Allowances

Read allowances:

```bash
curl http://127.0.0.1:4100/api/wallets/:id/allowances
```

Approve exact amount:

```bash
curl -X POST http://127.0.0.1:4100/api/wallets/:id/approve \
  -H 'content-type: application/json' \
  -d '{"tokenId":"...","routerId":"...","amount":"5","confirmLiveExecution":true}'
```

Revoke:

```bash
curl -X POST http://127.0.0.1:4100/api/wallets/:id/revoke \
  -H 'content-type: application/json' \
  -d '{"tokenId":"...","routerId":"...","confirmLiveExecution":true}'
```

Approvals and revokes are rejected while `DRY_RUN=true`.

The wallet UI requires explicit confirmation before approve and revoke requests. Approve requires typing `APPROVE`; revoke requires typing `REVOKE`. Review the wallet, token, router, router address, and amount/current allowance shown in the modal before continuing.

## Transaction Confirmation

List and detail:

```bash
curl http://127.0.0.1:4100/api/transactions
curl http://127.0.0.1:4100/api/transactions/:id
```

Refresh receipt:

```bash
curl -X POST http://127.0.0.1:4100/api/transactions/:id/refresh
```

Refresh behavior:

- Keeps `SUBMITTED` if receipt is unavailable.
- Marks successful receipts as `CONFIRMED_PENDING_FINALITY` until `CONFIRMATIONS_REQUIRED` is reached.
- Marks successful receipts as `CONFIRMED` only after the configured confirmation depth, default `3`.
- Marks reverted receipts as `FAILED`.
- Stores gas used, `confirmation_count`, and `finalized_block` when final.
- Updates daily wallet stats only after final `CONFIRMED` or `FAILED`.
- Sends Telegram confirmation/failure notification only after final `CONFIRMED` or `FAILED`.
- Adds a `dropped_reason` marker if a submitted transaction has no receipt after `SUBMITTED_TX_TIMEOUT_MS`, default `900000`.

Replacement transaction detection is still a placeholder. Operators must manually inspect the wallet nonce and explorer state before retrying or replacing a stuck live transaction.

## Scheduler

Status:

```bash
curl http://127.0.0.1:4100/api/scheduler/status
```

Start, pause, and stop. Pause/stop are graceful and do not drain pending queue jobs:

```bash
curl -X POST http://127.0.0.1:4100/api/scheduler/start
curl -X POST http://127.0.0.1:4100/api/scheduler/pause
curl -X POST http://127.0.0.1:4100/api/scheduler/stop
```

Purge queues only during operator-confirmed maintenance:

```bash
curl -X POST http://127.0.0.1:4100/api/scheduler/purge \
  -H 'content-type: application/json' \
  -d '{"confirm":"PURGE SCHEDULER QUEUES"}'
```

Configure wallet schedule:

```bash
curl -X POST http://127.0.0.1:4100/api/wallets/:id/schedule \
  -H 'content-type: application/json' \
  -d '{"enabled":true,"tradeAmountUsd":"1","minIntervalMinutes":60,"maxDailyRuns":3,"strategyProfile":"STABLE_ONLY","failedTxPauseThreshold":3,"emergencyPaused":false}'
```

Current boundary:

- Scheduled dry-runs are supported.
- Live scheduled execution is not implemented.
- Scheduler start rejects `SCHEDULER_LIVE_EXECUTION=true`; the scheduler is dry-run only.
- The scheduler loop uses a DB lease with TTL/heartbeat and writes `scheduler_runs` plus `scheduler_jobs`.
- A due schedule is skipped when it has an existing `PENDING` or `STARTED` scheduler job.
- `nextRunAt` is computed deterministically after every scheduled dry-run attempt.
- The dashboard scheduler start action requires typing `START SCHEDULER` and summarizes the current mode before sending the request.

## Observability

Every API response includes an `x-request-id` header. Fastify logs include the same request ID, and local audit metadata includes the active request ID when the operation runs inside an API request.

Queue-created notification jobs carry request ID correlation when available. Notification delivery rows include `request_id` and `job_id` fields so Telegram behavior can be traced from API request to queue job to delivery result.

Telegram delivery audit:

```bash
curl -b /tmp/base-orchestrator.cookies http://127.0.0.1:4100/api/settings/telegram
```

The Telegram settings response includes recent delivery rows, last test status, last delivery timestamp, and disabled/token-missing/chat-missing state flags. Delivery rows use `SENT`, `FAILED`, and `SKIPPED`; error messages are redacted and bot tokens are never returned.

`POST /api/settings/telegram/test` is locally rate limited. In automated tests, Telegram sends are mocked; do not use a real bot token unless explicitly validating local operator setup.

## Operator Dashboard Safety

The web dashboard is intentionally explicit about partial or demo state:

- Header badges come from `/api/runtime/status`, not web build-time environment variables.
- Demo Basescan links keep their URL but show a `DEMO` badge and tooltip: seeded demo data is not a real submitted transaction.
- Dangerous actions use confirmation modals with the exact action summary before service calls are made.
- Wallet activation, router enablement, high-risk token enablement, approve, revoke, execute once, scheduler start, and encrypted backup export are all confirm-gated in the UI.
- Dashboard panels distinguish approval exposure, pending transactions, recent rejections, and risk limits. When backend data is partial, the panel says so instead of implying full coverage.
- API failures render error cards with a retry action and are visually distinct from legitimate empty states.

## Logs

Docker service logs:

```bash
pnpm db:logs
```

API and web logs are printed by the dev processes. Sensitive fields are redacted by the API logger configuration, but operators must still avoid logging request bodies externally.

## Reset Local Data

This destroys local Postgres and Redis Docker volumes:

```bash
pnpm db:down
docker compose down -v
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

Confirm you have secure backups of `.env`, `MASTER_KEY_FILE`, and any encrypted wallet backup before resetting.

## Aggregate Risk

Aggregate risk limits apply across all wallets, not per-wallet. When 10+ wallets are active, aggregate tracking prevents total exposure from exceeding safe caps.

Check aggregate risk status:

```bash
curl -b /tmp/base-orchestrator.cookies http://127.0.0.1:4100/api/risk/aggregate
```

View today's aggregate stats:

```bash
curl -b /tmp/base-orchestrator.cookies http://127.0.0.1:4100/api/risk/aggregate/stats
```

Update aggregate risk limits (requires operator auth):

```bash
curl -b /tmp/base-orchestrator.cookies \
  -H 'x-csrf-token: <csrf-token>' \
  -H 'content-type: application/json' \
  -X PATCH http://127.0.0.1:4100/api/risk/aggregate/limits \
  -d '{"maxDailyTradeUsd":"20000","maxPendingWallets":15}'
```

Aggregate limits enforced:

- `maxDailyTradeUsd`: total trade volume per day
- `maxDailyGasUsd`: total gas spend per day
- `maxPendingTradeUsd`: total pending tx value
- `maxPendingWallets`: wallets with pending/submitted transactions
- `maxFailedTxPerDay`: failed tx count before blocking new plans

Re-compute stats from current transaction state:

```bash
curl -b /tmp/base-orchestrator.cookies \
  -H 'x-csrf-token: <csrf-token>' \
  -X POST http://127.0.0.1:4100/api/risk/aggregate/refresh-stats
```

## Safety Notes

- Do not seed real private keys.
- Do not store seed phrases.
- Do not log private keys, decrypted secrets, encrypted vault payloads, Telegram bot tokens, or the master key.
- Do not enable token or router records for live use until contract addresses are independently verified.
- Keep `DRY_RUN=true` during local development.
- Keep `REQUIRE_LIVE_CONFIRMATION=true`.
- Keep `ALLOW_UNLIMITED_APPROVAL=false`.
- Keep `AUTO_APPROVE=false`.
- Keep `SCHEDULER_LIVE_EXECUTION=false`.
