# Validation Report

Generated: 2026-05-08

## Safety State

- Local `.env` present: no.
- Effective default `DRY_RUN`: true.
- Live manual trading enabled: disabled by default. It requires `DRY_RUN=false` plus request-level live confirmation and all safety gates.
- Live scheduled trading enabled: disabled. `SCHEDULER_LIVE_EXECUTION=false` in `.env.example`, and live scheduled execution is not implemented.
- `REQUIRE_LIVE_CONFIRMATION`: true by documented default.
- `ALLOW_UNLIMITED_APPROVAL`: false by documented default.
- `AUTO_APPROVE`: false by documented default.

## Commands Run

| Command          | Result | Errors | Warnings                                              |
| ---------------- | ------ | ------ | ----------------------------------------------------- |
| `pnpm install`   | PASS   | None   | Lockfile was already up to date; install was a no-op. |
| `pnpm typecheck` | PASS   | None   | None.                                                 |
| `pnpm lint`      | PASS   | None   | None.                                                 |
| `pnpm test`      | PASS   | None   | None.                                                 |
| `pnpm build`     | PASS   | None   | None.                                                 |

## Test Results

`pnpm test` ran the API Vitest suite:

- Test files: 16 passed.
- Tests: 37 passed.

Coverage added or verified:

- Unit tests for wallet vault encryption/decryption and tamper rejection.
- Unit tests for Basescan address, transaction, and token link builders.
- Unit tests for risk engine policy and token/pair/wallet-pair validation.
- Unit tests for Telegram message formatting and token masking.
- Integration test for wallet import with encrypted key storage and safe output.
- Integration test for dry-run plan HTTP route and transaction row creation.
- Integration test for Telegram settings save with encrypted bot token.
- Integration test for transaction Basescan link generation from transaction hash.

## Scripts

Root scripts available:

- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm validate`

API test scripts available:

- `pnpm --filter @base-orchestrator/api test`
- `pnpm --filter @base-orchestrator/api test:unit`
- `pnpm --filter @base-orchestrator/api test:integration`

## Known Limitations

- Integration tests use an in-memory Drizzle-like adapter so they do not require Docker, Postgres, or Redis.
- Integration tests do not submit live Base transactions.
- Integration tests do not call the real Telegram Bot API.
- Integration tests do not call a real 0x endpoint.
- Transaction confirmation tests do not poll a real Base transaction hash.
- Seeded token and router addresses remain disabled placeholders until independently verified.
- Native ETH value swaps remain unsupported because execute-once currently sends `value=0`.
- Live scheduled execution remains intentionally unimplemented.
