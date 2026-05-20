# Wallet Security

## Threat Model

Primary threats:

- Private key leakage through logs, shell history, request dumps, browser tooling, backups, database exports, or chat.
- Master key disclosure from the local filesystem.
- Plaintext private-key persistence outside the encrypted vault.
- Accidental seed phrase support.
- Signing with the wrong key or a key that does not match the stored wallet address.
- Unsafe live writes caused by bad token, router, allowance target, quote, slippage, gas, or wallet limit configuration.
- Unlimited approvals leaving funds exposed to router or spender compromise.
- Encrypted backup files being copied together with the master key.
- Telegram bot token leakage.

Mitigations in code:

- Local operator auth and CSRF middleware in `apps/api/src/auth`.
- Fastify logger redaction in `apps/api/src/server.ts`.
- API response sanitization in `apps/api/src/wallets/wallet-service.ts`.
- AES-256-GCM authenticated encryption in `apps/api/src/vault/wallet-vault.ts`.
- Private-key/address validation before insert and before signing.
- New imports default to `PAUSED`.
- Live execution decrypts only after pre-send gates and simulation.
- Vault lock state in `apps/api/src/vault/vault-lock.ts`; live signing requires unlock.
- Global emergency pause in `apps/api/src/security/emergency-pause.ts`.
- Approvals are exact amount by default; unlimited approval is blocked unless `ALLOW_UNLIMITED_APPROVAL=true`.
- Seed phrase fields are rejected from encrypted backup imports.

## Private Key Lifecycle

1. Operator provides a single private key through the local CLI or wallet API.
2. `deriveAddressFromPrivateKey` derives the EVM address.
3. If an address is supplied, `assertPrivateKeyMatchesAddress` requires a match.
4. Duplicate normalized addresses are rejected by service logic and a database unique index.
5. `loadOrCreateMasterKey` loads the local 32-byte master key or creates one.
6. `encryptPrivateKey` encrypts the private key with AES-256-GCM and a fresh 12-byte IV.
7. The database stores only the encrypted payload and encryption version.
8. API responses omit encrypted and plaintext key material.
9. Signing paths require authenticated API access, CSRF, emergency pause disabled, and an unlocked vault before live key use.
10. Key rotation re-encrypts the same private key with a fresh nonce; it does not change the wallet address.

## Encryption Strategy

Owner file: `apps/api/src/vault/wallet-vault.ts`.

- Algorithm: AES-256-GCM.
- Master key size: 32 bytes.
- IV size: 12 bytes.
- Auth tag size: 16 bytes.
- Payload encoding: JSON envelope encoded as `base64url`.
- Payload fields: `version`, `algorithm`, `iv`, `authTag`, `ciphertext`.
- Current encryption version: `1`.
- Tampered ciphertext or unsupported payloads fail decryption.

The same `encryptSecret` and `decryptSecret` helpers encrypt wallet private keys and Telegram bot tokens.

## Master Key Handling

- Default path: `.local/master.key`.
- Environment override: `MASTER_KEY_FILE`.
- Created with parent directory mode `0700` and file mode `0600` where supported.
- The file must contain exactly 32 bytes.
- Losing the master key makes encrypted wallet keys and Telegram tokens unrecoverable.
- Copying the master key together with encrypted database/backups gives an attacker the material needed to decrypt secrets.
- Future production/server deployment should move this responsibility to KMS, HSM, MPC, or an OS keychain rather than a flat local file.

## Vault Lock

Owner files: `apps/api/src/vault/vault-lock.ts`, `apps/api/src/vault/vault-routes.ts`.

- API: `GET /api/vault/status`, `POST /api/vault/unlock`, `POST /api/vault/lock`.
- Initial state is `LOCKED`.
- Unlock accepts operator password re-auth or `VAULT_UNLOCK_PASSPHRASE` when configured.
- Unlock expires after `VAULT_AUTO_LOCK_MS`.
- Dry-run planning does not require unlock.
- Approvals, revokes, execute-once, and sensitive backup/key-rotation paths require unlock when live signing is possible.

## Local Auth Boundary

Owner files: `apps/api/src/auth/*`.

- API login sets an HTTP-only SameSite session cookie.
- Mutating routes require `x-csrf-token`.
- Wallet, balance, settings, scheduler, vault, transaction, and management routes require authentication.
- `GET /api/auth/me` and `POST /api/auth/login` are public by design.

## What Is Never Logged

Never log or store in audit metadata:

- Private keys.
- Seed phrases, mnemonics, or any seed phrase fragment.
- Decrypted private keys.
- `encryptedPrivateKey` payloads unless inside an explicit encrypted backup file.
- Telegram bot tokens.
- Decrypted Telegram tokens.
- Master key bytes, fingerprints with additional secret context, or master-key paths that reveal sensitive operator structure.
- Authorization and cookie headers.
- Full quote raw responses if they contain secrets or exceed safe size limits.

Known redaction owner: `apps/api/src/server.ts`.

## Approval Risks

Approval owner files: `apps/api/src/approvals/approval-service.ts`, `apps/api/src/approvals/approval-policy.ts`.

Risks:

- An enabled router address can spend approved tokens up to the allowance.
- Unlimited approvals remain dangerous even when swaps are disabled later.
- A compromised or incorrect router/allowance target can drain token balances.
- Token decimals mistakes can create approvals much larger or smaller than intended.
- Auto-approval can compound risk by granting allowance inside an execution flow.

Current controls:

- `ALLOW_UNLIMITED_APPROVAL=false` by default.
- `AUTO_APPROVE=false` by default.
- Approve requests require `DRY_RUN=false` and live confirmation.
- Revoke requests set allowance to `0`.
- Token and router addresses must be verified EVM addresses before approval writes.
- Router must be enabled.
- Approvals and revokes are stored as transaction rows.

## Revoke Process

1. Use the wallet detail Allowances panel or `POST /api/wallets/:id/revoke`.
2. Request includes `tokenId`, `routerId`, and `confirmLiveExecution=true`.
3. Server rejects unless `DRY_RUN=false` and live confirmation is present.
4. The service validates wallet, token, router, token address, router address, and router enabled state.
5. The wallet key is decrypted in memory.
6. ERC20 `approve(spender, 0)` is simulated and submitted.
7. A `REVOKE` transaction row is stored with `SUBMITTED`, `REJECTED`, or `FAILED`.
8. Telegram sends submitted or failed notification when configured.
9. Confirmation watcher later marks the transaction `CONFIRMED` or `FAILED` from the Base receipt.

## Emergency Pause

Owner files: `apps/api/src/security/emergency-pause.ts`, `apps/api/src/security/emergency-pause-routes.ts`, `apps/api/src/scheduler/scheduler-service.ts`, `apps/api/src/scheduler/scheduler-routes.ts`, `apps/web/components/global-emergency-pause-button.tsx`, `apps/web/components/emergency-pause-button.tsx`.

Emergency pause:

- Global emergency pause stores `local_settings.global_emergency_paused=true`.
- Global pause blocks approvals, revokes, execute-once, scheduler start, scheduled jobs, and auto-approval.
- Sets wallet status to `PAUSED`.
- Updates wallet schedule to `enabled=false` and `emergencyPaused=true`.
- Writes a `wallet.emergency_pause` audit log.
- Sends an `emergency pause` Telegram event when configured.

Emergency pause does not revoke ERC20 allowances and does not cancel already-submitted transactions. Operators should follow it with allowance review/revocation and transaction confirmation checks.
