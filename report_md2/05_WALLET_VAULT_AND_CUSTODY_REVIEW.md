# Wallet Vault And Custody Review

Date: 2026-05-20

Scope: Private key lifecycle, encryption, master key handling, vault lock, local file vault risk, backup/import/export, custody provider abstraction, and funds-readiness blockers.

Verdict/status: PARTIAL. Local encrypted vault is implemented for dev/demo and tiny-wallet experiments. Meaningful funds are blocked by custody architecture.

## Private Key Lifecycle

- IMPLEMENTED: Wallet import accepts private key only, not seed phrase, through shared schema `privateKeySchema`.
- IMPLEMENTED: `deriveAddressFromPrivateKey` and `assertPrivateKeyMatchesAddress` validate address ownership.
- IMPLEMENTED: New wallets default to `PAUSED`.
- IMPLEMENTED: Safe wallet responses omit plaintext and encrypted private keys.
- IMPLEMENTED: Live signing decrypts in memory only after live gates in approve/revoke/execute-once routes.
- PARTIAL: Private keys still enter API process memory for signing under local-file provider.

## Encryption Algorithm

- IMPLEMENTED: `apps/api/src/vault/wallet-vault.ts` uses AES-256-GCM.
- IMPLEMENTED: 32-byte master key, 12-byte IV, 16-byte auth tag.
- IMPLEMENTED: Payload is JSON envelope encoded as base64url.
- IMPLEMENTED: Tamper/unsupported payload tests exist in `apps/api/src/vault/wallet-vault.test.ts`.
- INFO: The local provider in `apps/api/src/vault/providers/local-file.ts` duplicates AES-GCM helper logic and labels itself dev-only.

## Master Key Handling

- IMPLEMENTED: `MASTER_KEY_FILE` defaults to `.local/master.key`.
- IMPLEMENTED: Missing key is created with random 32 bytes, parent directory `0700`, file `0600` where supported.
- HIGH: Master key is plaintext on disk. Database/encrypted backup plus master key equals full private-key compromise.
- HIGH: Loss of master key makes encrypted wallets and Telegram tokens unrecoverable.

## Vault Lock/Unlock

- IMPLEMENTED: `GET /api/vault/status`, `POST /api/vault/unlock`, `POST /api/vault/lock`.
- IMPLEMENTED: Unlock accepts operator password re-auth or optional passphrase.
- IMPLEMENTED: Auto-lock uses `VAULT_AUTO_LOCK_MS`.
- IMPLEMENTED: Live signing routes check vault unlock when `DRY_RUN=false` and `DEMO_MODE=false`.
- PARTIAL: Vault unlock is process-local. Restart locks again, but no hardware isolation exists.

## Local File Vault Risk

- HIGH / PARTIAL: Local filesystem custody is acceptable for local demo and tiny test wallets only.
- HIGH / PARTIAL: Malware, shell access, backup leakage, disk snapshots, or operator mistakes can expose `MASTER_KEY_FILE`.
- HIGH / PARTIAL: There is no hardware-backed signing policy, no per-wallet signing authorization, and no independent audit of key access.

## Backup/Export/Import

- IMPLEMENTED: Encrypted wallet backup schema rejects `privateKey`, `seedPhrase`, and `mnemonic`.
- IMPLEMENTED: Wallet backup import/export exists in `apps/api/src/wallets/encrypted-backup.ts` and wallet routes.
- IMPLEMENTED: Docs include backup/restore drill under `docs/BACKUP_RESTORE_DRILL.md`.
- PARTIAL: Backup safety depends on keeping encrypted backup and master key separate.
- NOT_TESTED: Backup/restore drill script was not run in this audit because it mutates local DB/services and is outside report-only scope.

## KMS/HSM/MPC/Hardware Signer Readiness

- PARTIAL: Provider interfaces and placeholder providers exist under `apps/api/src/vault/providers`.
- MISSING: Real KMS/HSM/MPC integration is not implemented or live-validated.
- MISSING: External signer path is not wired into approval/execute-once signing flow as a production custody boundary.

## Custody Provider Abstraction

- PARTIAL: `VAULT_PROVIDER` accepts `local-file`, `kms`, and `external-signer` in runtime config.
- PARTIAL: `local-file` reports `DEV_ONLY`.
- MISSING: Signing routes still directly decrypt local encrypted private keys through `wallet-vault.ts`; provider abstraction is not the authoritative signing path.

## What Blocks Meaningful Funds

- CRITICAL / MISSING: No hardware-backed or external signing provider is operational.
- HIGH / PARTIAL: Local-file master key can be copied.
- HIGH / PARTIAL: No policy engine controls what a signer can sign independent of API compromise.
- HIGH / PARTIAL: No tested incident process for compromised wallet, compromised machine, or lost master key.
- HIGH / NOT_TESTED: No real restore drill was performed in this audit.

## Recommended Custody Roadmap

1. Keep local-file provider for demo only.
2. Add provider-driven signing interface and remove direct private-key decryption from live signing routes.
3. Implement KMS/HSM/external signer with per-wallet policy.
4. Add key versioning and re-encryption migration.
5. Add signer audit log with request id, wallet id, action, target, calldata hash, quote hash, and operator id.
6. Add break-glass pause and signer revocation runbook.

## Acceptance Criteria

- Live signing route can operate without private key material entering API process memory.
- Production boot fails if `VAULT_PROVIDER=local-file` and live mode is enabled.
- Restore drill proves wallets decrypt/sign only with expected custody provider.
- Compromised API cannot sign arbitrary calldata without signer policy approval.
