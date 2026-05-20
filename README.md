# base-orchestrator

`base-orchestrator` is a local-first multi-wallet dashboard for Base trade automation, portfolio testing, transaction planning, guarded execution, allowance management, scheduling, and transaction tracking.

Use dedicated test/trading wallets only. Do not use primary custody wallets.

## Project Principles

- Local-only first: services run on your machine by default, with no hosted control plane.
- Security-first design: secrets are excluded from source control and redacted from API logs.
- Base Mainnet support: the project is structured around chain ID `8453`.
- Dry-run default: `DRY_RUN=true` is the default.
- Explicit live writes only: manual live execution requires environment gates, request confirmation, risk checks, whitelists, allowance checks, and simulation.
- No seed phrase support: the system must not import, store, request, or process seed phrases.
- Encrypted wallet vault only: private keys are stored only as encrypted vault payloads.

## What The System Does

The product is a legitimate wallet automation, portfolio testing, and transaction management tool for Base. It helps operators model wallet state, prepare dry-run plans, review risk controls, manage allowances, submit explicit one-shot transactions, track confirmations, and receive local notifications.

The project must not implement sybil evasion, reward-program manipulation, wash trading logic, human-mimicry, anti-detection behavior, platform-abuse features, or randomization intended to bypass detection.

## Workspace Layout

```text
apps/web           Next.js App Router UI with TypeScript and Tailwind
apps/api           Fastify API service with TypeScript
packages/shared    Shared constants and safety defaults
architecture       AI-readable system and flow documentation
plan               Build plan, phase status, tests, risks, debt
docs               User-facing local operations documentation
```

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm lint
pnpm test
pnpm dev
```

Default URLs:

- Web: `http://127.0.0.1:3100`
- API: `http://127.0.0.1:4100`
- Postgres: `localhost:5435`
- Redis: `localhost:6379`

## Local Demo

Run a local UI demo with mock wallets, mock balances, enabled demo pairs, fake transaction history, and Telegram disabled:

```bash
pnpm install
pnpm demo
```

`pnpm demo` starts Postgres and Redis, runs migrations, seeds demo data, and starts the API and web dashboard with:

```text
DEMO_MODE=true
DRY_RUN=true
QUOTE_PROVIDER=mock
REDIS_PORT=6380
REDIS_URL=redis://localhost:6380
OPERATOR_PASSWORD=demo-password
```

Open `http://127.0.0.1:3100/login` and sign in as `operator` with `demo-password`. Then click a demo wallet, review balances and transaction history, and click demo Basescan links. Demo transaction links use valid-looking fake hashes and include `demo=true` in the URL.

Demo commands:

```bash
pnpm demo:seed
pnpm demo:reset
pnpm demo
```

Demo mode does not require private keys. Demo wallets store the placeholder `DEMO_MODE_NO_PRIVATE_KEY`, and live execution is blocked while `DEMO_MODE=true`.

## Import A Real Test Wallet

Use only a dedicated test/trading wallet. Never import a primary wallet or seed phrase.

```bash
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm wallet:import
```

Imported wallets default to `PAUSED`. Set small wallet limits, verify token/router configuration, then resume the wallet from the dashboard or API.

## Run A Dry-Run

Keep dry-run enabled:

```text
DRY_RUN=true
QUOTE_PROVIDER=mock
```

In the dashboard:

1. Open a wallet.
2. Ensure the wallet is active.
3. Ensure tokens, pair, router, and wallet-pair rule are enabled.
4. Use the Dry Run Trade card.

Dry-runs do not decrypt private keys, sign transactions, or submit on-chain transactions.

## Enable Telegram

1. Create a Telegram bot with BotFather.
2. Get a chat ID with `getUpdates`.
3. Open `http://127.0.0.1:3100/settings/telegram`.
4. Enable Telegram, paste the bot token, enter the chat ID, save, and send a test notification.

Bot tokens are encrypted before storage and never returned by the API.

## Switch From Mock Quote To Live Quote Provider

Mock quotes are the default and cannot execute live because they do not include calldata.

To use the 0x quote provider for reads:

```text
QUOTE_PROVIDER=zeroX
ZEROX_API_KEY=...
ZEROX_SWAP_QUOTE_URL=https://api.0x.org/swap/allowance-holder/quote
ZEROX_API_VERSION=v2
```

Before using live quote data, independently verify Base token addresses, token decimals, router addresses, allowance targets, and quote response behavior.

## Enable Live Execution Safely

Live execution is for explicit one-shot tests only. Do not enable it in demo mode.

Checklist:

- Use a dedicated wallet funded only with a tiny amount.
- Keep `DEMO_MODE=false` or unset.
- Set `DRY_RUN=false` only for the test window.
- Keep `REQUIRE_LIVE_CONFIRMATION=true`.
- Keep `ALLOW_UNLIMITED_APPROVAL=false`.
- Keep `AUTO_APPROVE=false`.
- Keep `SCHEDULER_LIVE_EXECUTION=false`.
- Use `QUOTE_PROVIDER=zeroX` only after verifying provider behavior.
- Verify token, router, and allowance target addresses.
- Use exact small approvals and revoke after testing.
- Submit only through Execute Once with request confirmation.
- Refresh the transaction until confirmed or failed.
- Return `.env` to `DRY_RUN=true` after testing.

## Current Status

Implemented in code:

- Local web dashboard.
- Fastify API.
- Drizzle/Postgres schema and migrations.
- Encrypted wallet vault.
- Base read-only client and Basescan link builders.
- Token, pair, router, and wallet-pair-rule management.
- Dry-run planner and quote provider abstraction.
- Mock quote provider and 0x quote provider scaffold.
- Telegram settings and notifications.
- Guarded manual execute-once.
- ERC20 allowance reads, exact approvals, and revokes.
- Redis-backed BullMQ scheduler for scheduled dry-runs.
- Confirmation watcher for submitted transactions.
- Wallet profiles, bulk actions, and encrypted wallet backups.

Current boundaries:

- Live execution remains disabled by default.
- Live scheduled execution is intentionally not implemented.
- Seeded token/router addresses are placeholders and disabled.
- Native ETH value swaps are not supported yet because execute-once sends `value=0`.
- Public/server deployment needs authentication, authorization, and stronger secret management before exposure beyond localhost.

Start with `docs/README.md` and `architecture/00-system-map.md` for the full operator and AI-agent map.
