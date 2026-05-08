# Known Risks

## Key Leakage

- Private keys can leak through terminal history, copied request bodies, browser devtools, logs, screenshots, issue trackers, backups, or chat.
- `MASTER_KEY_FILE` disclosure plus database/encrypted backup disclosure allows decryption.
- Telegram bot token disclosure allows message sending as the bot.

Mitigations:

- Use dedicated wallets only.
- Keep `.env`, `.local/master.key`, database dumps, and encrypted backups out of git.
- Prefer local CLI import with hidden input.
- Do not paste private keys into chat or shell commands that persist history.

## Bad Approvals

- Incorrect router or allowance target can spend approved tokens.
- Unlimited approvals are high-risk.
- Token decimals mistakes can approve the wrong magnitude.

Mitigations:

- Keep `ALLOW_UNLIMITED_APPROVAL=false`.
- Keep `AUTO_APPROVE=false`.
- Approve exact small amounts.
- Revoke allowances when a router is no longer needed.
- Verify token decimals and router addresses outside this repo before enabling live use.

## Gas Spikes

- Quote gas estimates can be stale.
- Network congestion can make a transaction uneconomic or fail.
- Current cost accounting is not a full gas/PnL engine.

Mitigations:

- Configure `wallets.max_gas_usd`.
- Use small live tests.
- Review failed and confirmed transaction records.

## Slippage

- Price can move between quote, simulation, and execution.
- Quote providers can return optimistic output amounts.
- Current dry-run slippage is a conservative estimate, not a full DEX simulation.

Mitigations:

- Configure low `pairs.max_slippage_bps`.
- Avoid illiquid pairs.
- Use verified quote providers and small amounts first.

## RPC Failure

- `BASE_RPC_URL` can be unavailable, lagging, rate-limited, or inconsistent.
- Receipt polling can fail temporarily.
- Simulation can pass but send can still fail due to state changes.

Mitigations:

- Treat `SUBMITTED` as pending until receipt refresh confirms final status.
- Run manual refresh for important transactions.
- Use reliable RPC providers for live mode.

## Router Changes

- Routers can upgrade, deprecate, change behavior, or have integrations disabled.
- Quote provider targets and allowance targets can change.
- Seeded routers are placeholders and disabled.

Mitigations:

- Verify router addresses before enabling.
- Re-check whitelist records after provider or router updates.
- Do not enable routers solely because a seeded row exists.

## Token Decimals Mistakes

- Wrong decimals cause incorrect allowance amounts, displayed balances, and raw amount conversions.
- Seed data contains token symbols and decimals but no verified addresses.

Mitigations:

- Verify token address and decimals from primary sources before enabling.
- Run allowance and balance checks with tiny amounts before approvals or swaps.

## Platform And Eligibility Risks

- This software must not be used for sybil evasion, reward-program manipulation, wash trading, anti-detection workflows, human-mimicry, or platform abuse.
- Some platforms prohibit automated or coordinated activity even when transactions are valid on-chain.
- Wallet automation can create compliance, tax, accounting, and terms-of-service obligations.

Mitigations:

- Keep strategies legitimate, transparent, and operator-reviewed.
- Do not add detection-bypass randomization or platform-abuse features.
- Review external platform rules before using automated workflows.

## Current Live Execution Risks

- Manual execute-once is implemented but not proven against verified live Base contracts in this workspace.
- Native ETH transaction value is not modeled; execute-once sends `value=0`.
- No nonce manager exists; avoid concurrent live transactions per wallet.
- Mock quotes cannot execute because they do not include calldata.
- 0x integration is a scaffold and needs live validation.
- Telegram delivery failure does not roll back operations.
- Scheduler live execution is not implemented.
