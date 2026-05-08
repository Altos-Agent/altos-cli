# Test Plan

## Unit Tests

Run:

```bash
pnpm test
```

Current API unit coverage areas:

- Vault encryption, decryption, master key creation, and tamper rejection.
- Encrypted wallet backup validation.
- Management risk policy.
- Planner accepted/rejected dry-runs.
- Quote engine/provider normalization.
- Telegram message/settings behavior with mocked HTTP.
- Live execution safety checks.
- Approval policy.
- Scheduler policy.
- Transaction confirmation mapping.
- Basescan link builders.
- Wallet profiles.

Future unit tests:

- Runtime environment validation.
- Native-value quote handling once implemented.
- Nonce management once implemented.
- Token decimals conversion edge cases across approval and trade flows.

## Integration Tests

Local integration checklist:

1. `pnpm db:up`.
2. `pnpm db:migrate`.
3. `pnpm db:seed`.
4. `pnpm dev:api`.
5. `curl http://127.0.0.1:4100/health`.
6. `curl http://127.0.0.1:4100/api/chain/status`.
7. Import one dedicated test wallet.
8. Verify wallet list/detail API responses omit private and encrypted keys.
9. Create or update token, router, pair, and wallet-pair-rule records.
10. Run dry-run planner.
11. Start and stop scheduler against Redis.
12. Refresh a transaction that has no hash and confirm it errors safely.

Use only dedicated wallets and placeholder or tiny-value test data.

## Dry-Run Tests

Dry-run acceptance checklist:

- Wallet is `ACTIVE`.
- Tokens are enabled.
- Pair is enabled.
- Router is enabled.
- Wallet-pair rule is enabled with max trade amount.
- Amount is below all wallet, pair, and wallet-pair-rule limits.
- Wallet daily trade limit is not reached.
- Estimated gas is below wallet gas limit.
- Slippage is below pair limit.
- `DRY_RUN=true`.
- Result creates a `DRY_RUN` transaction.

Dry-run rejection checklist:

- Paused wallet rejects.
- Disabled pair rejects.
- Missing wallet-pair rule rejects.
- Disabled token rejects.
- Disabled router rejects.
- Amount above any limit rejects.
- Daily trade limit rejects.
- Gas above limit rejects.
- Slippage above limit rejects.
- `DRY_RUN=false` rejects dry-run planning.
- Rejection creates a `REJECTED` transaction with readable reasons.

## Live Test Checklist

Do not run live tests until all items are true:

- Dedicated wallet funded only with an amount you can lose.
- `MASTER_KEY_FILE` backed up securely.
- Token addresses verified for Base Mainnet.
- Token decimals verified.
- Router addresses verified.
- Pair and wallet-pair limits set to tiny values.
- `BASE_RPC_URL` points to a reliable provider.
- `QUOTE_PROVIDER=zeroX` or another real provider is configured and validated.
- Quote `txTo` and `allowanceTarget` match enabled router records.
- `DRY_RUN=false` is set only for the test window.
- `REQUIRE_LIVE_CONFIRMATION=true`.
- `ALLOW_UNLIMITED_APPROVAL=false`.
- `AUTO_APPROVE=false`.
- `SCHEDULER_LIVE_EXECUTION=false`.
- Approval amount is exact and tiny.
- Execute-once request includes `confirmLiveExecution=true`.
- Transaction is manually refreshed until `CONFIRMED` or `FAILED`.
- Allowance is revoked after testing.
- `.env` is returned to `DRY_RUN=true`.

Do not test native ETH swaps until transaction value support is implemented.

## Telegram Test Checklist

1. Create bot with BotFather.
2. Send a message to the bot or group.
3. Get chat ID from `getUpdates`.
4. Open `/settings/telegram`.
5. Save token and chat ID.
6. Confirm API response returns only `tokenPreview`.
7. Click Send test or call `POST /api/settings/telegram/test`.
8. Trigger a dry-run accepted event.
9. Trigger a dry-run rejected event.
10. If live testing is enabled, verify submitted/failed/confirmed events.
11. Disable Telegram and confirm operations still succeed without sends.

## Security Test Checklist

- Confirm seed phrase input is not accepted by any wallet import or backup path.
- Confirm wallet API responses do not include `privateKey` or `encryptedPrivateKey`.
- Confirm Fastify logs redact sensitive request fields.
- Confirm duplicate wallet addresses are rejected.
- Confirm tampered encrypted private-key payload fails decryption.
- Confirm master key file has restrictive permissions where supported.
- Confirm encrypted backup containing plaintext key fields is rejected.
- Confirm master-key mismatch import is rejected unless explicitly allowed, and allowed mismatch imports create disabled wallets.
- Confirm live execute rejects under default `DRY_RUN=true`.
- Confirm live execute rejects without `confirmLiveExecution=true`.
- Confirm mock quotes cannot be live executed.
- Confirm unknown `txTo` and `allowanceTarget` reject.
- Confirm insufficient allowance returns `NEEDS_APPROVAL`.
- Confirm unlimited approval rejects by default.
- Confirm emergency pause disables wallet schedule and pauses wallet.
