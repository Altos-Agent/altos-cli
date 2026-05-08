# Wallet Vault Audit
Date: 2026-05-08
Repository audit scope: Wallet import, private-key validation, encryption, leak prevention, duplicate handling, backup/export, rotation, and API responses.
Verdict/status: PARTIAL. The vault is suitable for local demo and controlled dry-run testing; live funds need stronger custody controls.

## Wallet Import

| Item | Status | Evidence |
|---|---|---|
| UI import form | IMPLEMENTED | `apps/web/components/wallet-import-card.tsx` |
| CLI import | IMPLEMENTED | `apps/api/src/cli/wallet-import.ts` |
| API import | IMPLEMENTED | `POST /api/wallets/import` in `apps/api/src/wallets/wallet-routes.ts` |
| Default status after import | IMPLEMENTED | Imported wallets are stored as `PAUSED`. |
| Demo wallets without private keys | IMPLEMENTED | `apps/api/src/db/demo-data.ts` stores `DEMO_MODE_NO_PRIVATE_KEY`. |

## Private Key Validation

`apps/api/src/vault/wallet-vault.ts` derives addresses using `ethers.Wallet`, normalizes EVM addresses, and can assert that a private key matches a supplied address. Duplicate wallet addresses are blocked in service logic and by the DB unique index.

Gaps:

| Severity | Status | Gap | Fix |
|---|---|---|---|
| MEDIUM | PARTIAL | Import validation is manual, not schema-driven. | Add shared input schema with private-key format checks and address checksum normalization. |
| MEDIUM | PARTIAL | Duplicate detection depends on normalized address consistency. | Add tests for mixed-case and checksum address import collisions. |

## Encryption

Private keys are encrypted by `encryptPrivateKey` using the vault primitive. The encrypted ciphertext and encryption version are stored in `wallets.encrypted_private_key` and `wallets.encryption_version`.

| Severity | Status | Finding | Fix |
|---|---|---|---|
| INFO | IMPLEMENTED | Ciphertext does not contain plaintext private key in unit tests. | Keep regression tests in `wallet-vault.test.ts`. |
| HIGH | PARTIAL | No per-wallet key derivation or key separation. | Add envelope encryption with per-wallet data keys or KMS-backed data keys. |
| HIGH | PARTIAL | Same vault mechanism protects wallet keys and Telegram token. | Separate encryption context/key IDs by secret type. |

## Decryption Leak Review

Decryption occurs in:

| Path | Purpose | Risk |
|---|---|---|
| `apps/api/src/approvals/approval-service.ts` | Sign ERC20 approve/revoke | Private key is present in process memory. |
| `apps/api/src/trades/trade-routes.ts` | Sign live transaction | Private key is present in process memory. |
| `apps/api/src/wallets/wallet-service.ts` | Backup import/rotation | Private key is present in process memory. |

No code path intentionally prints decrypted keys. Logger redaction is configured in `apps/api/src/server.ts`. Remaining risk is process compromise, debug dumps, and memory capture.

## API Response Leak Review

| Endpoint group | Status | Review |
|---|---|---|
| Wallet list/detail/import/update | IMPLEMENTED | Uses `sanitizeWallet`; secret fields are omitted. |
| Backup export | PARTIAL | Encrypted backup intentionally exports ciphertext and master key fingerprint. This must never be treated as safe if stored next to the master key. |
| Telegram settings | IMPLEMENTED | Returns token preview, not token. |

## Duplicate Wallets

Status: IMPLEMENTED. Service checks existing address and DB has `wallets_address_idx`. Acceptance criteria for hardening: tests should cover same key, same address with different case, and concurrent duplicate import.

## Key Rotation

Status: PARTIAL. `rotateWalletKey` re-encrypts a wallet using the currently loaded master key and increments encryption version. This is not full master-key rotation if the master key itself is compromised.

Required fix: implement master-key rotation with staged old/new key providers, re-encryption progress tracking, backup invalidation, and failure recovery.

## Backup/Export Safety

Encrypted backup export exists in `apps/api/src/wallets/wallet-service.ts` and format validation exists in `apps/api/src/wallets/encrypted-backup.ts`. This is useful, but the backup remains sensitive.

| Severity | Status | Gap | Fix |
|---|---|---|---|
| HIGH | PARTIAL | Backup can be decrypted by anyone with matching master key. | Add warning UI, encrypt backups to passphrase/public key, and store separately from `.local/master.key`. |
| MEDIUM | PARTIAL | Non-matching master-key import creates disabled wallets with unusable ciphertext. | Add remediation workflow and clearer UI. |
| MEDIUM | MISSING | No backup restore integration against real Postgres. | Add integration test with DB migration and restore. |

## Exact Gaps and Fixes

| Severity | Gap | Actionable fix | Acceptance criteria |
|---|---|---|---|
| CRITICAL | File-based hot master key is not sufficient for live funds. | Add vault provider abstraction and OS keyring/KMS/passphrase-backed provider. | Live signing cannot happen with only DB access. |
| HIGH | No explicit unlock window for signing. | Add vault locked/unlocked state and operator unlock command. | Approval/execute endpoints reject while vault is locked. |
| HIGH | No emergency key compromise workflow. | Add runbook and API/UI emergency disable/revoke checklist. | Operator can pause all wallets and list revocation tasks. |
| MEDIUM | Backup export has no UI friction. | Add confirmation, warnings, and destination guidance. | Backup export requires explicit acknowledgement. |

