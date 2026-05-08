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

Run API and web:

```bash
pnpm dev
```

Default URLs:

- Web: `http://localhost:3100`
- API: `http://127.0.0.1:4100`
- Postgres: `localhost:5435`
- Redis: `localhost:6379`

Health checks:

```bash
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4100/api/chain/status
```

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

Emergency-pause one wallet:

```bash
curl -X POST http://127.0.0.1:4100/api/wallets/:id/emergency-pause
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
  -d '{"walletId":"...","pairId":"...","amountIn":"10"}'
```

Dry-run:

```bash
curl -X POST http://127.0.0.1:4100/api/plans/dry-run \
  -H 'content-type: application/json' \
  -d '{"walletId":"...","pairId":"...","amountIn":"10","mode":"DRY_RUN_ONLY"}'
```

Dry-runs never decrypt private keys, sign transactions, or submit on-chain transactions.

## Manual Execute Once

Check live status:

```bash
curl http://127.0.0.1:4100/api/trades/live-status
```

Submit one explicit live request:

```bash
curl -X POST http://127.0.0.1:4100/api/trades/execute-once \
  -H 'content-type: application/json' \
  -d '{"walletId":"...","pairId":"...","amountIn":"10","confirmLiveExecution":true}'
```

This is rejected under default `.env.example` because `DRY_RUN=true`. Only enable live mode after completing `plan/02-test-plan.md`.

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
- Marks successful receipts as `CONFIRMED`.
- Marks reverted receipts as `FAILED`.
- Stores gas used.
- Updates daily wallet stats.
- Sends Telegram confirmation/failure notification when configured.

## Scheduler

Status:

```bash
curl http://127.0.0.1:4100/api/scheduler/status
```

Start and stop:

```bash
curl -X POST http://127.0.0.1:4100/api/scheduler/start
curl -X POST http://127.0.0.1:4100/api/scheduler/stop
```

Configure wallet schedule:

```bash
curl -X POST http://127.0.0.1:4100/api/wallets/:id/schedule \
  -H 'content-type: application/json' \
  -d '{"enabled":true,"tradeAmountUsd":"1","minIntervalMinutes":60,"maxDailyTrades":3,"strategyProfile":"STABLE_ONLY","failedTxPauseThreshold":3,"emergencyPaused":false}'
```

Current boundary:

- Scheduled dry-runs are supported.
- Live scheduled execution is not implemented.
- Scheduler start rejects `SCHEDULER_LIVE_EXECUTION=true` while `DRY_RUN=true`.

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
