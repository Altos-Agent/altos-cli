# base-orchestrator Guide

`base-orchestrator` is a local-first dashboard for Base Mainnet wallet operations, dry-run trade planning, guarded manual live execution, ERC20 approvals, transaction tracking, scheduling, and Telegram notifications.

Use dedicated test/trading wallets only. Do not use primary custody wallets.

## What You Can Do

- Import dedicated private-key wallets into a local encrypted vault.
- Manage wallet status, limits, profiles, and schedules.
- Configure tokens, pairs, routers, and wallet-specific pair rules.
- Run dry-run trade plans without decrypting private keys.
- Request quotes through the mock provider or 0x provider scaffold.
- Execute a single live transaction only after explicit live-mode gates pass.
- Read ERC20 allowances, approve exact amounts, and revoke allowances.
- Track submitted transactions and refresh confirmations.
- Send Telegram notifications for configured events.
- Emergency-pause a wallet schedule and wallet status.

## What The App Must Not Be Used For

- Sybil evasion.
- Reward-program manipulation.
- Wash trading.
- Human-mimicry or anti-detection workflows.
- Platform-abuse automation.
- Randomization intended to bypass detection.
- Seed phrase storage or import.

## Start Locally

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open:

- Web: `http://localhost:3100`
- API: `http://127.0.0.1:4100`

Default safety state:

- `DRY_RUN=true`
- `REQUIRE_LIVE_CONFIRMATION=true`
- `ALLOW_UNLIMITED_APPROVAL=false`
- `AUTO_APPROVE=false`
- `SCHEDULER_LIVE_EXECUTION=false`

## First-Time Workflow

1. Keep `.env` in dry-run mode.
2. Start Postgres and Redis.
3. Run migrations and seed.
4. Import a dedicated wallet.
5. Resume the wallet only after setting limits.
6. Verify token addresses, token decimals, and router addresses before enabling live records.
7. Configure a pair and wallet-pair rule with small limits.
8. Run dry-run plans.
9. Configure Telegram and send a test notification if desired.
10. Do not run live execute-once until the live checklist in `plan/02-test-plan.md` is complete.

## Important Docs

- Local setup: `docs/LOCAL_SETUP.md`
- Wallet safety: `docs/WALLET_SECURITY.md`
- Telegram setup: `docs/TELEGRAM_SETUP.md`
- Basescan links: `docs/BASESCAN_LINKS.md`
- Operations runbook: `docs/OPERATIONS_RUNBOOK.md`
- System architecture: `architecture/00-system-map.md`
- Transaction flow: `architecture/02-transaction-flow.md`
- Test plan: `plan/02-test-plan.md`
- Known risks: `plan/03-known-risks.md`
