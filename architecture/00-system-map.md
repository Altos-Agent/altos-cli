# System Map

## Project Purpose

`base-orchestrator` is a local-first Base Mainnet trade automation and transaction management dashboard. It is intended for dedicated test/trading wallets, dry-run planning, explicit operator-reviewed live execution, ERC20 allowance management, scheduler-backed operational queues, transaction confirmation tracking, and Telegram notifications.

The product must not implement sybil evasion, reward-program manipulation, wash trading, human-mimicry, anti-detection behavior, platform-abuse workflows, or randomization intended to bypass detection.

## Runtime Surfaces

| Surface         | Purpose                                                                                        | Owner files                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Web app         | Next.js dashboard for wallets, tokens, pairs, transactions, scheduler, approvals, and settings | `apps/web/app`, `apps/web/components`, `apps/web/lib/api.ts`               |
| API             | Fastify HTTP API and orchestration boundary                                                    | `apps/api/src/server.ts`                                                   |
| Shared package  | Shared product constants and safety defaults                                                   | `packages/shared/src/index.ts`                                             |
| Database schema | Drizzle schema, migrations, and local seed data                                                | `apps/api/src/db/schema.ts`, `apps/api/drizzle`, `apps/api/src/db/seed.ts` |
| Local services  | Postgres, Redis, optional pgAdmin                                                              | `docker-compose.yml`                                                       |

## Main Modules

| Module                     | Responsibility                                                                                                                                                 | Owner files                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet service             | Import private keys, encrypt vault payloads, sanitize wallet responses, rotate encrypted payloads, encrypted backup import/export, bulk status/profile changes | `apps/api/src/wallets/wallet-service.ts`, `apps/api/src/wallets/wallet-routes.ts`, `apps/api/src/wallets/encrypted-backup.ts`             |
| Vault                      | Master key file handling, AES-256-GCM encryption/decryption, address derivation and private-key/address validation                                             | `apps/api/src/vault/wallet-vault.ts`                                                                                                      |
| Management and risk policy | Token, pair, router, and wallet-pair-rule management with enablement rules                                                                                     | `apps/api/src/management/management-service.ts`, `apps/api/src/management/risk-policy.ts`, `apps/api/src/management/management-routes.ts` |
| Strategy planner           | Dry-run trade planning and reusable risk evaluation for live execution                                                                                         | `apps/api/src/strategy/planner.ts`, `apps/api/src/strategy/trade-context.ts`, `apps/api/src/strategy/walletProfiles.ts`                   |
| Quote engine               | Provider abstraction for mock quotes and 0x quotes                                                                                                             | `apps/api/src/quote/quoteEngine.ts`, `apps/api/src/quote/providers/mock.ts`, `apps/api/src/quote/providers/zeroX.ts`                      |
| Live execution             | Manual execute-once path, safety gates, allowance checks, simulation, signing, transaction storage                                                             | `apps/api/src/trades/trade-routes.ts`, `apps/api/src/trades/live-execution.ts`                                                            |
| Approvals                  | ERC20 allowance reads, exact approvals, revoke to zero                                                                                                         | `apps/api/src/approvals/approval-service.ts`, `apps/api/src/approvals/approval-policy.ts`, `apps/api/src/approvals/approval-routes.ts`    |
| Blockchain reads           | Base public client, balances, token reads, Basescan link builders                                                                                              | `apps/api/src/blockchain`                                                                                                                 |
| Transactions               | Transaction list/detail, receipt refresh, daily stats update, confirmation/failure notifications                                                               | `apps/api/src/transactions/confirmation.ts`, `apps/api/src/transactions/transaction-routes.ts`                                            |
| Scheduler                  | BullMQ queues, workers, wallet schedule policy, emergency pause                                                                                                | `apps/api/src/scheduler`                                                                                                                  |
| Telegram                   | Encrypted settings, message formatting, Bot API send, event preference filtering                                                                               | `apps/api/src/notifications/telegram.ts`, `apps/api/src/notifications/telegram-routes.ts`                                                 |
| Profiles                   | Conservative wallet and schedule presets                                                                                                                       | `apps/api/src/profiles/wallet-profiles.ts`, `apps/api/src/profiles/profile-routes.ts`                                                     |

## Data Flow

1. Web UI calls the Fastify API through `apps/web/lib/api.ts`.
2. API routes validate local inputs and call service modules.
3. Services read/write Postgres through Drizzle tables in `apps/api/src/db/schema.ts`.
4. Read-only chain operations use `basePublicClient` and `BASE_RPC_URL`.
5. Live writes, when explicitly enabled, decrypt a wallet key only after safety gates and simulation.
6. Submitted transaction rows are refreshed by manual API calls or the confirmation worker.
7. Telegram notifications are sent after configured events and failures are deliberately swallowed in most business flows so notification outages do not block local operations.

## Wallet Flow

1. Operator imports a private key through the local CLI or wallet API.
2. `wallet-service.ts` derives the EVM address and optionally checks it against the provided address.
3. `wallet-vault.ts` loads or creates `MASTER_KEY_FILE`.
4. The private key is encrypted with AES-256-GCM and stored in `wallets.encrypted_private_key`.
5. API responses return only `SafeWallet` fields and omit `privateKey` and `encryptedPrivateKey`.
6. New wallets default to `PAUSED`.
7. Wallets can be paused, resumed, disabled, deleted, profile-applied, schedule-configured, emergency-paused, or exported/imported as encrypted backup envelopes.

## Trade Flow

Dry-run:

1. `POST /api/plans/dry-run` loads wallet, pair, tokens, routers, wallet-pair rule, daily stats, and quote.
2. `planDryRunTrade` checks dry-run mode, wallet status, pair/rule enablement, token whitelist, router whitelist, allowance target whitelist, limits, gas, and slippage.
3. Accepted plans create `DRY_RUN` transaction rows. Rejected plans create `REJECTED` rows with reasons.

Manual live execute once:

1. `POST /api/trades/execute-once` rejects early unless `DRY_RUN=false` and request confirmation is present.
2. A quote is requested from the configured provider.
3. Shared risk checks and live safety checks run before signing.
4. ERC20 allowance is checked if the quote includes an allowance target.
5. The transaction is simulated with `basePublicClient.call`.
6. Only then is the encrypted key decrypted in memory and used to sign/send through viem.
7. The API stores `SUBMITTED`, `REJECTED`, or `FAILED` transaction rows and sends Telegram notifications where configured.

## Notification Flow

1. Telegram settings are stored in `telegram_settings`.
2. Bot tokens are encrypted with the same local vault master key.
3. Service flows call `createTelegramService(db).notify(...)` with normalized event payloads.
4. Notification preferences decide whether to send.
5. `sendTelegramMessage` calls Telegram Bot API `sendMessage`.
6. Scheduler notification jobs use `notificationQueue` and `notification.worker.ts`.

## Scheduler Flow

1. `POST /api/scheduler/start` creates BullMQ queues and workers.
2. Start is rejected if `SCHEDULER_LIVE_EXECUTION=true` while `DRY_RUN=true`.
3. Enabled wallet schedules are scanned.
4. `canScheduleWallet` rejects disabled schedules, emergency pauses, non-active wallets, daily trade limit hits, and daily loss limit hits.
5. A deterministic `minIntervalMinutes` check prevents too-frequent scheduling.
6. The scheduler chooses the first enabled wallet-pair rule matching enabled pair/tokens and profile constraints.
7. Trade jobs currently support scheduled dry-runs. Live scheduled execution is intentionally not implemented.
8. Confirmation jobs refresh submitted transactions and can pause wallets after configured failed transaction thresholds.

## Security Boundaries

- Local-first operation: no hosted control plane exists in this repo.
- `.env` and `MASTER_KEY_FILE` are local secrets and must not be committed.
- Seed phrases are unsupported and must stay unsupported.
- Private keys are accepted only for dedicated wallets and are encrypted before database storage.
- API logs redact private keys, encrypted keys, bot tokens, seed phrases, master keys, and decrypted secrets in `apps/api/src/server.ts`.
- Live execution is guarded by environment flags, request confirmation, risk checks, whitelists, allowance checks, simulation, and dedicated transaction records.
- Router, token, and allowance target addresses must be verified independently before enabling live use.
- Scheduler live mode is not implemented; dry-run scheduling is the only current scheduled trade path.
- Telegram delivery is optional and should never be treated as the only audit trail.
