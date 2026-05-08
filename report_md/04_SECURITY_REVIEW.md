# Security Review
Date: 2026-05-08
Repository audit scope: Wallet security, key lifecycle, encryption, master key handling, logs, Telegram/RPC secrets, approvals, router/token whitelists, and live execution.
Verdict/status: LIVE_NOT_RECOMMENDED. Security posture is acceptable for isolated local demo/dry-run use, not for unattended live funds.

## Wallet Security

| Severity | Status | Finding | Evidence | Fix |
|---|---|---|---|---|
| INFO | IMPLEMENTED | Wallet API sanitizes responses and omits `privateKey` and `encryptedPrivateKey`. | `sanitizeWallet` in `apps/api/src/wallets/wallet-service.ts` | Keep response tests. |
| HIGH | PARTIAL | Private keys decrypt into JavaScript strings during signing, backup rotation, and validation. | `decryptPrivateKey` calls in wallet, approval, and trade modules | Minimize decrypt scope, zero buffers where possible, consider signer abstraction/HSM/MPC. |
| CRITICAL | PARTIAL | Master key is a local file next to the app data boundary. | `apps/api/src/vault/wallet-vault.ts`, `MASTER_KEY_FILE=.local/master.key` | Add OS keyring/KMS/passphrase unlock and operational key custody policy. |

## Private Key Lifecycle

1. User submits a private key through UI or CLI.
2. API derives/validates address with ethers.
3. API encrypts the private key using AES-256-GCM.
4. Encrypted ciphertext is stored in `wallets.encrypted_private_key`.
5. Decryption occurs only for signing, encrypted-backup rotation, and backup validation paths.
6. API responses omit secret fields.

Lifecycle gaps: no secure-memory zeroization, no passphrase unlock state, no per-wallet encryption key, no revocation/key compromise workflow beyond disabling wallets and rotating ciphertext under the same master key.

## Encryption Design

| Area | Status | Review |
|---|---|---|
| Algorithm | IMPLEMENTED | AES-256-GCM envelope appears appropriate for local encryption. |
| IV/tag handling | IMPLEMENTED | Uses 12-byte IV and auth tag. |
| Serialization | IMPLEMENTED | JSON/base64url envelope. |
| Key derivation | MISSING | No passphrase/KDF mode; master key is raw random file material. |
| Key separation | MISSING | Same vault primitive protects wallet keys and Telegram bot token. |
| Rotation | PARTIAL | Wallet ciphertext can be re-encrypted, but master-key rotation workflow is not complete. |

## Master Key Handling

| Severity | Status | Risk | Mitigation |
|---|---|---|---|
| CRITICAL | PARTIAL | `.local/master.key` plus DB backup decrypts all wallets. | Store master key outside repo/app directory; use OS keyring/KMS; document backup separation. |
| HIGH | MISSING | No operator unlock step. | Require explicit unlock for live signing. |
| HIGH | MISSING | No key compromise drill. | Add runbook for pause, revoke, rotate, backup invalidation, and wallet migration. |

## What Is Never Logged

The Fastify logger redacts request private keys, bot tokens, authorization/cookie headers, encrypted private keys, seed phrases, and master key names in `apps/api/src/server.ts`. This is positive. Remaining logging risks:

| Severity | Status | Risk | Fix |
|---|---|---|---|
| MEDIUM | PARTIAL | `console.info` logs scheduler job IDs and wallet IDs. | Use structured logger with redaction and request/job IDs. |
| MEDIUM | PARTIAL | Error handlers often replace detailed errors with generic messages, which is safe for secrets but weak for diagnosis. | Store redacted internal error codes in audit logs, not responses. |

## Telegram Token and RPC/API Secrets

Telegram bot token is encrypted at rest in `telegram_settings.encrypted_bot_token`. The chat ID is plaintext. 0x API key and RPC URL are environment variables. There is no server-side secret manager, no env validation, and no production deployment isolation.

## Approval Risks

Exact approvals and revokes are implemented, and unlimited approval is disabled unless `ALLOW_UNLIMITED_APPROVAL=true`. However, approvals still expose funds to the selected router/spender. Router enablement and address verification must be stricter before live use.

## Router/Token Whitelist Risks

| Severity | Status | Finding | Fix |
|---|---|---|---|
| HIGH | PARTIAL | Token/router management accepts loosely validated values in some routes. | Enforce EVM address validation, chain ID lock, decimals range, checksum normalization. |
| HIGH | PARTIAL | Pair preferred/fallback router is text by name, not a foreign key. | Use router IDs or addresses with FK-like validation. |
| MEDIUM | PARTIAL | Token whitelist checks require enabled tokens but not verified metadata provenance. | Add manual verification fields and operator approval. |

## Live Execution Risks

Critical blockers before live mode: auth, idempotency, nonce locks, exact quote validation, raw amount correctness, confirmation depth, reorg handling, production secrets, and E2E guardrail tests.

## Critical Vulnerabilities and Required Mitigations

| Severity | Status | Vulnerability | Required mitigation | Acceptance criteria |
|---|---|---|---|---|
| CRITICAL | MISSING | Unauthenticated mutating API. | Add local auth/session/CSRF and deny-by-default write routes. | Unauthenticated requests to all `POST/PATCH/PUT/DELETE` routes return 401/403. |
| CRITICAL | PARTIAL | Hot file-based vault key. | Add stronger vault provider and operator unlock. | Live signing cannot occur unless vault is explicitly unlocked; key file alone is insufficient. |
| HIGH | MISSING | No per-wallet transaction lock. | Add lock/idempotency table. | Duplicate execute requests return same transaction record or are rejected. |
| HIGH | PARTIAL | Weak quote/call validation. | Validate all quote fields before simulation/signing. | Malformed/wrong-router/wrong-chain quotes are rejected in tests. |

