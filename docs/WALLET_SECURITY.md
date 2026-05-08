# Wallet Security

`base-orchestrator` is designed for dedicated test/trading wallets, not primary custody wallets.

## Safe Wallet Practices

- Use fresh wallets created only for this tool.
- Fund wallets with small amounts you can afford to lose.
- Never import seed phrases.
- Never import a primary wallet.
- Keep `.local/master.key` private and backed up securely.
- Keep encrypted backups private.
- Keep `.env` out of git.
- Revoke allowances after testing or when a router is no longer needed.
- Keep `DRY_RUN=true` unless actively performing a reviewed live test.

## Vault Rules

Owner files:

- `apps/api/src/vault/wallet-vault.ts`
- `apps/api/src/wallets/wallet-service.ts`

Rules:

- Seed phrases are unsupported.
- Private keys are accepted only through the local import flow.
- Private keys are encrypted with AES-256-GCM using the local `MASTER_KEY_FILE`.
- API responses never return private keys or encrypted private-key payloads.
- New wallets default to `PAUSED`.
- Signing code decrypts keys only in memory and only after server-side safety gates pass.

## Live Execution Gates

Live transaction writes require:

- `DRY_RUN=false`.
- `REQUIRE_LIVE_CONFIRMATION=true` by default.
- Request-level `confirmLiveExecution=true`.
- Active wallet status.
- Enabled pair, token, router, and wallet-pair rule.
- Risk engine approval.
- Quote transaction target and hex calldata.
- Router and allowance target whitelist checks.
- ERC20 allowance check when applicable.
- viem simulation before signing.

Manual execute-once exists. Live scheduled execution is not implemented.

## ERC20 Approvals

Approval management is manual by default:

- `ALLOW_UNLIMITED_APPROVAL=false`
- `AUTO_APPROVE=false`
- Approve requests require an exact token amount.
- Revoke requests set allowance to `0`.
- Unlimited approval is rejected unless explicitly enabled server-side.
- Approval and revoke submissions are logged as `APPROVE` and `REVOKE` transaction records.
- Basescan links are stored for submitted approval and revoke transactions.

Operator guidance:

- Prefer the smallest practical allowance for the next intended trade.
- Revoke allowances when a router is no longer needed.
- Treat any unlimited allowance as high risk.
- Do not enable router records until contract addresses are independently verified.
- Verify token decimals before approval.

## Approval Checks During Trades

Manual trade execution reads ERC20 allowance before sending a swap when a quote includes an allowance target.

If allowance is below the quote sell amount, execute-once returns `NEEDS_APPROVAL` unless auto-approval is explicitly enabled by both environment and request. Auto-approval is disabled by default and should remain disabled for normal local testing.

## Encrypted Backups

Encrypted backup export contains encrypted private-key payloads and wallet metadata only. It must not contain plaintext private keys, seed phrases, or mnemonics.

Rules:

- Backups are still sensitive.
- A backup plus matching `MASTER_KEY_FILE` can decrypt private keys.
- Master-key mismatch imports are rejected by default.
- If mismatch import is explicitly allowed, imported wallets are stored as `DISABLED`.

## Emergency Pause

Emergency pause:

- Sets wallet status to `PAUSED`.
- Disables the wallet schedule.
- Sets `emergencyPaused=true`.
- Sends Telegram notification when configured.

Emergency pause does not revoke allowances and does not cancel already-submitted transactions. After emergency pause, review allowances and submitted transactions.
