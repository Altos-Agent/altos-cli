# Telegram Notifications

## Settings

Owner files:

- `apps/api/src/notifications/telegram.ts`
- `apps/api/src/notifications/telegram-routes.ts`
- `apps/web/components/telegram-settings-form.tsx`

Settings table: `telegram_settings`.

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
- Wallet name and shortened address.
- Action.
- Pair or router context.
- Amount.
- Status.
- Timestamp.
- Optional transaction hash.
- Optional Basescan link.

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

Most callers catch Telegram errors so local operations are not rolled back when Telegram is unavailable. This means database transaction records and audit logs are the source of truth; Telegram is an operator convenience channel.

## Test Notification

Endpoint:

```http
POST /api/settings/telegram/test
```

Test flow:

1. Load or create settings.
2. Require encrypted bot token and chat ID.
3. Decrypt bot token in memory.
4. Send a simple `test notification` message with timestamp.
5. Return `{ ok: true, sentAt }` on success.

Use the web UI at `/settings/telegram` or the API to validate bot token and chat ID after setup.
