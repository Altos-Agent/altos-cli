# Telegram Setup

`base-orchestrator` can send local Telegram notifications through the Telegram Bot API `sendMessage` endpoint.

## Create A Bot Token

1. Open Telegram and start a chat with `@BotFather`.
2. Send `/newbot`.
3. Follow BotFather prompts for bot name and username.
4. Copy the bot token.

Store the token only through the local settings UI or API. The API encrypts the token before saving it and never returns the decrypted token.

## Get A Chat ID

For a direct chat:

1. Start a conversation with your bot.
2. Send any message to the bot.
3. Open this URL in a browser, replacing the token:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

4. Find `message.chat.id` in the JSON response.

For a group chat, add the bot to the group, send a message, and inspect `getUpdates` for the group chat ID.

## Configure Locally

1. Start the API and web app.
2. Open `http://localhost:3100/settings/telegram`.
3. Enable Telegram.
4. Paste the bot token.
5. Enter the chat ID.
6. Choose notification toggles.
7. Save.
8. Send a test notification.

## API

```http
GET /api/settings/telegram
PUT /api/settings/telegram
POST /api/settings/telegram/test
```

`GET /api/settings/telegram` returns only `tokenPreview`, never the decrypted bot token.

## Events

Supported event types:

- `dry-run accepted`
- `dry-run rejected`
- `transaction submitted`
- `transaction confirmed`
- `transaction failed`
- `transaction rejected`
- `wallet paused due to risk limit`
- `emergency pause`

Event preference mapping:

- Dry-run accepted/rejected: `notifyOnDryRun`.
- Transaction submitted: `notifyOnSubmitted`.
- Transaction confirmed: `notifyOnConfirmed`.
- Transaction failed: `notifyOnFailed`.
- Transaction rejected, wallet risk pause, emergency pause: `notifyOnRejected`.

## Message Format

Messages include:

- Product name.
- Event.
- Wallet name and shortened address.
- Action.
- Pair or router context.
- Amount.
- Status.
- Timestamp.
- Optional transaction hash.
- Optional Basescan link.

## Security Notes

- Do not commit bot tokens.
- Do not paste bot tokens into logs, issue trackers, or chat.
- Bot tokens are encrypted using the local master key file from `MASTER_KEY_FILE`.
- Losing `MASTER_KEY_FILE` makes encrypted local bot tokens unrecoverable.
- Telegram is not the source of truth. Transaction rows and audit logs are the durable records.
