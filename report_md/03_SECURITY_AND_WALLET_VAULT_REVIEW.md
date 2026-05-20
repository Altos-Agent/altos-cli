# Security And Wallet Vault Review

Date: 2026-05-13  
Scope: Auth, CSRF, route protection, vault encryption, key lifecycle, Telegram secrets, logging, emergency pause, and custody risk.  
Verdict/status: PARTIAL for live funds; IMPLEMENTED for local demo/dry-run guardrails.

## Auth / Session / CSRF Review

| Control | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Operator login | IMPLEMENTED | `apps/api/src/auth/auth-routes.ts` | Username/password login exists. |
| Session cookie | IMPLEMENTED | `auth-middleware.ts`, `session-store.ts` | HttpOnly, SameSite=Lax, Secure in production; in-memory store. |
| CSRF protection | IMPLEMENTED | `auth-middleware.ts`, `csrf.ts` | Unsafe `/api/*` methods require `x-csrf-token`. |
| Public route allowlist | IMPLEMENTED | `auth-middleware.ts` | `/health`, login, and `/api/auth/me` are public. |
| Login rate limit | MISSING | `rate-limit.ts` not applied to login | Add before server exposure. |
| Password hashing | PARTIAL | `password.ts` | Supports `sha256:<hex>` but no adaptive KDF. |

## Route Protection Review

All non-public `/api/*` routes pass through the auth middleware. Mutating authenticated routes require CSRF. Integration tests cover unauthenticated mutation rejection, CSRF rejection, and authenticated CSRF acceptance in `apps/api/src/auth/security.integration.test.ts`.

## Vault Encryption Review

| Topic | Status | Evidence |
| --- | --- | --- |
| Encryption algorithm | IMPLEMENTED | AES-256-GCM in `wallet-vault.ts` |
| IV/tag handling | IMPLEMENTED | 12-byte IV and auth tag stored in payload |
| Master key length | IMPLEMENTED | 32-byte master key required |
| File permissions | IMPLEMENTED | Directory `0700`, file `0600` where supported |
| Tamper rejection tests | IMPLEMENTED | `wallet-vault.test.ts` |

## Vault Lock / Unlock Review

`apps/api/src/vault/vault-lock.ts` keeps process-local unlock state with `VAULT_AUTO_LOCK_MS`. Live signing routes require unlock when `DRY_RUN=false` and `DEMO_MODE=false`. Dry-run planning does not require unlock. This is appropriate for a local process but not sufficient for multi-instance deployment without shared lock state or a proper secret manager.

## Master Key Handling

- Default source is `MASTER_KEY_FILE`, documented in `.env.example` and `docs/WALLET_SECURITY.md`.
- Master key auto-creation is convenient for local demo but dangerous if not backed up.
- Backup plus master key equals wallet compromise.
- No KMS/HSM/MPC/hardware wallet support is implemented.

## Private Key Lifecycle

- Seed phrases are unsupported by policy and docs.
- Private keys are accepted only through import flows.
- Stored private keys are encrypted; API responses do not return plaintext or encrypted private-key payloads.
- Live signing decrypts private keys in process memory after gates pass.
- Address/private-key mismatch is rejected with `assertPrivateKeyMatchesAddress`.

## Backup / Export / Import Safety

Encrypted backup support exists in `apps/api/src/wallets/encrypted-backup.ts` and related tests. Mismatched master-key imports are rejected by default; explicit mismatch handling imports disabled wallets only. Plaintext private-key backup fields are rejected. Restore drills were NOT_TESTED in this audit.

## Telegram Token Handling

Telegram bot token is encrypted using the same vault primitive, returned only as a preview, and decrypted only for delivery. Delivery audit rows sanitize request metadata. Telegram still exposes transaction metadata to a third party when enabled.

## Logging / Redaction

Pino request logs include method/url/status/timing and request IDs. Tests assert Telegram token is not sent in message body. This audit did not find evidence that private keys are logged. Add structured redaction review before production.

## Emergency Pause

Global emergency pause is stored in `local_settings.globalEmergencyPaused` and blocks approvals, revokes, execute-once, scheduler start, scheduled jobs, and auto-approval. Wallet emergency pause sets wallet paused, disables schedule, writes audit log, and can notify Telegram. Emergency pause does not cancel submitted transactions or revoke allowances.

## Remaining Custody Risks

| Severity | Risk | Status |
| --- | --- | --- |
| CRITICAL | Local file master key can decrypt all vault entries | PARTIAL |
| HIGH | Decrypted key enters process memory for live signing | IMPLEMENTED but risky |
| HIGH | No hardware wallet, MPC, KMS, or HSM path | MISSING |
| HIGH | Public deployment auth/session model is local-first | PARTIAL |
| MEDIUM | Vault unlock state is process-local | PARTIAL |

## KMS / HSM / MPC / Hardware Wallet Recommendations

1. Use dedicated low-value wallets until hardware-backed signing exists.
2. Move master-key storage to KMS or OS secret manager for server dry-runs.
3. For live funds, prefer hardware wallet/MPC signing where the API cannot export raw keys.
4. Add key rotation and per-wallet key provenance metadata.
5. Add mandatory restore drill before live testing.

## Live-Funds Readiness Verdict

Verdict/status: MANUAL_LIVE_TEST_NOT_READY for this audit. The code has meaningful gates, but custody remains local-file based and operator verification/drills are incomplete. Use only dedicated low-value wallets after a separate operator review.

