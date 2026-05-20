# Custody Security Gaps

Date: 2026-05-20

Scope: Wallet vault, master key, local-file custody, KMS/external signer stubs, vault unlock, backup/export/import, live-signing readiness, and production security.

Verdict/status: HIGH / PARTIAL. The local encrypted vault is suitable for demo/dev and possibly tiny dedicated test wallets. Meaningful funds are blocked by missing production custody.

## Current Implementation

- IMPLEMENTED: `apps/api/src/vault/wallet-vault.ts` uses AES-256-GCM with 12-byte IVs and a 32-byte master key file.
- IMPLEMENTED: `loadOrCreateMasterKey()` creates master key file with mode `0600` where supported.
- IMPLEMENTED: `assertPrivateKeyMatchesAddress()` verifies imported key/address relationship.
- IMPLEMENTED: `apps/api/src/vault/vault-lock.ts` requires explicit unlock for live signing and auto-locks by time window.
- IMPLEMENTED: `apps/api/src/vault/vault-routes.ts` rate-limits unlock attempts.
- IMPLEMENTED: `apps/api/src/wallets/encrypted-backup.ts` validates encrypted backup format and rejects plaintext key/seed fields.
- PARTIAL: Provider interfaces exist in `apps/api/src/vault/providers/*`.

## Gaps

- CRITICAL / MISSING: `kms.ts` and `external-signer.ts` are stubs and cannot protect meaningful funds.
- HIGH / PARTIAL: `wallet-vault.ts` still directly loads local master key and decrypts private keys for signing; provider registry is status-visible but not integrated into encryption/signing flows.
- HIGH / PARTIAL: Local-file provider says `supportsLiveSigning()` is true although its safety level is `DEV_ONLY`; this is technically accurate but product-risky without additional gates.
- HIGH / MISSING: No hardware-backed signing, MPC workflow, HSM, KMS envelope encryption implementation, signer audit callback, or operator approval queue.
- HIGH / MISSING: No key rotation implementation for active encrypted wallet records.
- MEDIUM / PARTIAL: Backup/restore scripts exist, but this audit did not run a drill.
- MEDIUM / PARTIAL: Vault unlock alert exists, but incident response and alert delivery drills are not proven.

## Exact Files Likely Touched

- `apps/api/src/vault/wallet-vault.ts`
- `apps/api/src/vault/vault-lock.ts`
- `apps/api/src/vault/vault-routes.ts`
- `apps/api/src/vault/providers/index.ts`
- `apps/api/src/vault/providers/provider-registry.ts`
- `apps/api/src/vault/providers/local-file.ts`
- `apps/api/src/vault/providers/kms.ts`
- `apps/api/src/vault/providers/external-signer.ts`
- `apps/api/src/wallets/wallet-service.ts`
- `apps/api/src/wallets/encrypted-backup.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/approvals/approval-service.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/runtime/runtime-status.ts`
- `apps/web/components/vault-controls.tsx`
- `apps/web/components/wallet-import-card.tsx`
- `docs/CUSTODY_HARDENING_ROADMAP.md`
- `docs/WALLET_SECURITY.md`

## Acceptance Criteria

- CRITICAL: Production live mode cannot use `VAULT_PROVIDER=local-file`.
- CRITICAL: Meaningful-funds mode requires KMS/HSM/MPC/external signer or explicit product block.
- HIGH: Signing path uses a custody provider abstraction, not direct local-file decrypt by default.
- HIGH: Vault provider status is displayed in UI and blocks live flows when safety level is `DEV_ONLY`.
- HIGH: Backup/restore drill passes without exposing plaintext private keys.
- HIGH: Vault unlock and signing attempts are audited with request IDs and alert hooks.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/vault/wallet-vault.test.ts apps/api/src/vault/vault-lock.integration.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/wallets/encrypted-backup.test.ts
pnpm test
```
