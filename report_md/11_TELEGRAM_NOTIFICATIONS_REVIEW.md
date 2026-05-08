# Telegram Notifications Review
Date: 2026-05-08
Repository audit scope: Telegram settings, token encryption, test notification, event coverage, formatting, failure notifications, Basescan links, and security concerns.
Verdict/status: PARTIAL. Telegram is implemented for local use, but observability and security controls should improve before live operations.

## Settings

| Setting | Status | Evidence |
|---|---|---|
| Enabled flag | IMPLEMENTED | `telegram_settings.enabled` |
| Bot token | IMPLEMENTED | Stored encrypted as `encrypted_bot_token`. |
| Chat ID | IMPLEMENTED | Stored plaintext as `chat_id`. |
| Event preferences | IMPLEMENTED | Submitted, confirmed, failed, rejected, dry-run flags. |
| UI form | IMPLEMENTED | `apps/web/components/telegram-settings-form.tsx` |

## Token Encryption

The bot token is encrypted using `encryptSecret` from `apps/api/src/vault/wallet-vault.ts`. This avoids plaintext DB storage. The token is decrypted in memory when sending messages or generating the preview.

Risk: the same master key protects both wallet private keys and Telegram tokens. Use separate encryption context/key IDs in a future vault provider.

## Test Notification

Status: IMPLEMENTED. `POST /api/settings/telegram/test` sends a basic test message if token and chat ID are configured.

Missing:

- Rate limiting.
- Delivery result audit record.
- UI distinction between Telegram disabled, token missing, chat ID missing, and Telegram API failure.

## Message Events

| Event | Status | Source |
|---|---|---|
| Dry-run accepted/rejected | IMPLEMENTED | Planner/scheduler notification paths. |
| Transaction submitted | IMPLEMENTED | Live execute and approvals. |
| Transaction confirmed/failed | IMPLEMENTED | Confirmation watcher. |
| Transaction rejected | IMPLEMENTED | Planner/live rejection paths. |
| Wallet paused due to risk limit | IMPLEMENTED | Scheduler confirmation worker path. |
| Emergency pause | IMPLEMENTED | Scheduler emergency pause path. |

## Failure Notification

Status: PARTIAL. Failure notifications are sent for live transaction/approval failures and confirmation failures, but many `.catch(() => undefined)` handlers intentionally swallow Telegram errors. That is acceptable for not breaking trading flows, but the system needs observable notification failure metrics and audit logs.

## Test Notification and Formatting

`buildTelegramMessage` produces simple plaintext messages with product name, event, wallet, action, pair, amount, status, timestamp, tx hash, and Basescan link.

Positive: plaintext avoids Markdown escaping issues.

Gaps:

- No chain/network label in every message.
- No demo/dry-run/live label in every message.
- No amount unit clarity for raw versus display amounts.
- No idempotency/request ID.

## Basescan Links in Messages

Status: IMPLEMENTED. Transaction and approval paths include `basescanUrl` when available. Demo links are fake but valid-looking with demo marking in seeded data.

Recommended fix: include explicit `Mode: DEMO` or `Mode: DRY_RUN` in Telegram messages to avoid confusion.

## Security Concerns

| Severity | Status | Concern | Fix |
|---|---|---|---|
| HIGH | MISSING | Telegram settings routes are unauthenticated. | Add auth before settings can be read/changed/tested. |
| MEDIUM | PARTIAL | Chat ID is plaintext. | Treat as sensitive operational metadata and redact logs. |
| MEDIUM | MISSING | No rate limit on test send. | Add per-minute limiter. |
| MEDIUM | PARTIAL | Token preview reveals numeric bot ID prefix. | Acceptable locally; consider shorter preview. |

