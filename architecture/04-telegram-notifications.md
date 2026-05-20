# Telegram Notifications

## Settings

Owner files:

- `apps/api/src/notifications/telegram.ts`
- `apps/api/src/notifications/telegram-routes.ts`
- `apps/web/components/telegram-settings-form.tsx`

Settings table: `telegram_settings`.
Delivery table: `notification_deliveries`.

Fields:

- `enabled`
- `encryptedBotToken`
- `chatId`
- `notifyOnSubmitted`
- `notifyOnConfirmed`
- `notifyOnFailed`
- `notifyOnRejected`
- `notifyOnDryRun`

The bot token is encrypted with `encryptSecret` from the vault module. API responses return only `tokenPreview`, never the decrypted token.

## Message Events

Supported event types:

- `dry-run accepted`
- `dry-run rejected`
- `transaction submitted`
- `transaction confirmed`
- `transaction failed`
- `transaction rejected`
- `wallet paused due to risk limit`
- `emergency pause`

Message payload includes:

- Product name.
- Event type.
- Mode label: `DEMO`, `DRY_RUN`, or `LIVE`.
- Chain label: `Base 8453`.
- Request ID.
- Queue job ID when available.
- Wallet name and shortened address.
- Action.
- Pair or router context.
- Amount.
- Status.
- Timestamp.
- Optional transaction hash.
- Optional Basescan link.
- Explicit `No transaction was sent` text for dry-run or rejected events without a hash.

Event sources:

- Dry-run planner and scheduled dry-run.
- Manual execute-once submitted, rejected, and failed outcomes.
- Approval and revoke submitted and failed outcomes.
- Confirmation refresh confirmed and failed outcomes.
- Scheduler pause after failure threshold.
- Emergency pause.

## Failure Notification

Failure notifications use the same `notify` path as other events:

- `transaction failed` is controlled by `notifyOnFailed`.
- `transaction rejected`, `wallet paused due to risk limit`, and `emergency pause` are controlled by `notifyOnRejected`.

Most callers catch Telegram errors so local operations are not rolled back when Telegram is unavailable. Every send, failure, and skip writes a `notification_deliveries` row so the operator can audit notification behavior after the fact. Database transaction records, audit logs, and delivery rows are the source of truth; Telegram is an operator convenience channel.

Delivery statuses:

- `SENT`: Telegram API accepted the message.
- `FAILED`: Telegram API or network request failed.
- `SKIPPED`: Telegram disabled, missing token/chat ID, disabled event preference, or local rate limit.

Delivery rows include request/job correlation when available, wallet/transaction references, a destination preview, and a redacted error code/message. Bot tokens are never logged or stored in delivery audit rows.

## Test Notification

Endpoint:

```http
POST /api/settings/telegram/test
```

Test flow:

1. Load or create settings.
2. Apply the local test-send rate limit.
3. Record a skipped delivery if the token or chat ID is missing.
4. Decrypt bot token in memory.
5. Send a simple `test notification` message with mode, chain, request ID, and timestamp.
6. Record `SENT` or `FAILED`.
7. Return `{ ok: true, sentAt }` on success.

Use the web UI at `/settings/telegram` or the API to validate bot token and chat ID after setup.
