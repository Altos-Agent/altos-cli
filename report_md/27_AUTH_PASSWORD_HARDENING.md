# Auth Password Hardening

Date: 2026-05-13  
Scope: Phase 2 replacement of operator password SHA-256 hashing with Argon2id.  
Verdict/status: PASS.

## Summary

Operator password hashing now uses Argon2id through the `argon2` package. The
old `sha256:<hex>` format is no longer generated and is supported only for
temporary verification with a deprecation warning.

No wallet vault encryption, session cookie behavior, CSRF enforcement, dry-run
defaults, live-trading gates, or scheduler safety settings were weakened.

## Files Changed

| File | Change |
| --- | --- |
| `apps/api/src/auth/password.ts` | Added async Argon2id `hashPassword`, `verifyPassword`, and deprecated SHA-256 compatibility verification. |
| `apps/api/src/auth/auth-routes.ts` | Await password verification during login. |
| `apps/api/src/vault/vault-lock.ts` | Await password verification during vault unlock. |
| `apps/api/src/vault/vault-routes.ts` | Await async vault unlock. |
| `apps/api/src/cli/auth-hash-password.ts` | Added password hash helper CLI. |
| `apps/api/package.json` | Added `argon2` and `auth:hash-password`. |
| `package.json` | Added root `pnpm auth:hash-password`. |
| `apps/api/src/auth/password.test.ts` | Added Argon2id and legacy compatibility tests. |
| `apps/api/src/config/env.ts` | Validates operator hash format and still rejects plaintext production passwords. |
| `apps/api/src/config/env.test.ts` | Added malformed hash and plaintext production tests. |
| `.env.example` | Documents Argon2id helper. |
| `docker-compose.prod.example.yml` | Removed SHA-256 placeholder. |
| `docs/AUTH_SETUP.md` | Documents Argon2id setup and legacy deprecation. |
| `docs/WALLET_SECURITY.md` | Notes Argon2id hash requirement for shared/production-like use. |

## Behavior

- `hashPassword(password)` returns an encoded `$argon2id$...` hash.
- `verifyPassword(hash, password)` verifies Argon2id hashes.
- Same password hashes produce different outputs because Argon2id salts each hash.
- Wrong passwords fail verification.
- Legacy `sha256:<hex>` hashes can verify only with a deprecation warning.
- Production config still rejects plaintext `OPERATOR_PASSWORD`.
- Production config requires `OPERATOR_PASSWORD_HASH` and non-default `SESSION_SECRET`.

## CLI Helper

Run:

```bash
pnpm auth:hash-password
```

The helper prompts for the password without echoing in an interactive terminal
and prints the Argon2id hash once. Do not paste real passwords into shell
history.

## Validation

| Command | Result |
| --- | --- |
| `pnpm --filter @base-orchestrator/api test src/auth/password.test.ts src/config/env.test.ts src/auth/security.integration.test.ts src/vault/vault-lock.integration.test.ts` | PASS |
| `printf 'test-password\n' \| pnpm auth:hash-password` | PASS with escalated sandbox permissions for `tsx` IPC; printed an Argon2id hash for a dummy password |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS: API 33 files / 117 tests, web 1 file / 2 tests |
| `pnpm build` | PASS |
| `pnpm docker:compose:prod:check` | PASS |

Full validation results are recorded in the final response for this phase.

## Remaining Risks

| Severity | Risk | Status |
| --- | --- | --- |
| MEDIUM | Existing deployments with legacy `sha256:<hex>` hashes must rotate to Argon2id. | DOCUMENTED |
| LOW | `argon2` is a native dependency and must be available in deployment builds. | WATCH |
