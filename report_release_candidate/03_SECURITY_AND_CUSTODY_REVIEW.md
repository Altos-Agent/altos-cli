# 03 — Security and Custody Review

**Date:** 2026-05-21

---

## Auth Routes — What Has Auth, What Doesn't

### Protected Routes (with `requireRole`)

| Route | Method | Auth Required | Re-auth | Confirmation |
|-------|--------|--------------|---------|--------------|
| `/api/scheduler/start` | POST | admin | No | No |
| `/api/scheduler/purge` | POST | admin | 5min | "PURGE SCHEDULER QUEUES" |
| `/api/vault/unlock` | POST | admin | No | No |
| `/api/vault/lock` | POST | admin | No | No |
| `/api/trade/execute-once` | POST | admin | 5min | "EXECUTE LIVE TRADE" |
| `/api/wallets/:id/approve` | POST | admin | 5min | "APPROVE LIVE" |
| `/api/emergency-pause/disable` | POST | admin | 5min | "DISABLE EMERGENCY PAUSE" |
| `/api/wallets/import` | POST | operator | No | No |
| `/api/wallets/:id/rotate-key` | POST | admin | No | No |
| `/api/wallets/:id` | DELETE | operator | No | No |

### Completely Unprotected Routes (CRITICAL)

| Route | Method | Problem | Severity |
|-------|--------|---------|----------|
| `/api/scheduler/pause` | POST | No auth, no re-auth, no confirmation | CRITICAL |
| `/api/scheduler/stop` | POST | No auth, no re-auth, no confirmation | CRITICAL |
| `/api/emergency-pause/enable` | POST | No auth whatsoever | CRITICAL |
| `/api/wallets/:id/pause` | POST | No auth | CRITICAL |
| `/api/wallets/:id/resume` | POST | No auth | CRITICAL |
| `/api/wallets/:id/disable` | POST | No auth | CRITICAL |
| `/api/wallets/:id/schedule` | POST/PATCH | No auth | CRITICAL |
| `/api/wallets/:id/emergency-pause` | POST | No auth | CRITICAL |
| `/api/wallets/bulk/apply-profile` | PATCH | No auth | CRITICAL |
| `/api/wallets/bulk/status` | PATCH | No auth | CRITICAL |

**Any unauthenticated caller — or any authenticated caller with a valid session — can halt the scheduler, enable emergency pause, pause any wallet, or modify any wallet's schedule.**

---

## MFA

### What Works
- TOTP generation (RFC 6238)
- 30-second window + 1-step clock skew grace
- 8 bcrypt-hashed single-use recovery codes
- AES-256-GCM encryption of TOTP secret at rest
- MFA verify required at login when enabled
- MFA disable requires valid TOTP code + password

### What Doesn't Work
- **MFA only enforced at login** — no per-operation MFA challenge
- After session established, `requireReauth` uses **password reauth**, not TOTP
- A stolen session cookie bypasses MFA entirely for all subsequent operations
- No `requireMfa()` middleware for sensitive routes
- MFA verify endpoint has no documented rate limit

### Verdict
**Partial** — implemented correctly but not enforced on operations beyond login.

---

## RBAC

### What's Implemented
- Three roles: viewer (0), operator (1), admin (2)
- `requireRole()` middleware on admin/operator routes
- Role hierarchy: admin > operator > viewer

### What's Missing
- Session role is **hardcoded to `"admin"`** on creation (`session-store-factory.ts`)
- No lookup against an operators table — roles are never fetched from DB at session creation
- If the intent was per-user roles from a database, those are never checked
- Bulk wallet operations (apply-profile, status) have no auth at all

### Verdict
**Partial** — admin routes are protected but session role is not tied to actual user permissions.

---

## Vault Lock

### What Works
- `VaultLockStatus`: LOCKED / UNLOCKED
- Auto-lock after configurable `VAULT_AUTO_LOCK_MS` (default 15 min)
- `assertVaultUnlocked()` enforced before signing
- `requiresVaultForLiveSigning()` gates on `!dryRun && !demoMode`
- `isVaultUnlocked()` check without throwing

### What's Missing
- **No MFA challenge** to unlock vault — passphrase or password only
- **No audit log** — who unlocked, when, from what IP
- Vault state is **per-worker memory** — in multi-process deployment, worker A's unlock does not propagate to worker B
- No rate limit on vault unlock beyond generic 5/15min per IP

### Verdict
**Weak for multi-worker** — single-worker is acceptable; multi-worker is unsafe.

---

## External Signer Integration

### What's Implemented
- `ExternalHttpSignerProvider` class defined
- Bearer token + mTLS header support
- Configurable sign timeout (30s default)
- Health check endpoint support

### What's Missing / Broken
- **`SigningCoordinator` is never called from any route** — all signing bypasses it
- **External signer URL has no real mTLS** — mTLS passed as `X-Client-Cert` header, not TLS client certificate
- **No retry logic** if external signer returns 5xx
- **No signature verification** — doesn't verify returned `{v,r,s}` matches requested tx
- **No nonce management integration** — external signer uses its own nonce strategy independently
- **No certificate validation** — custom CA not supported

### Verdict
**NOT USED / DEAD CODE** — defined but never wired into execution path.

---

## Signer Policy Engine

### What's Implemented
- 9 policy rules: wallet status, emergency pause, router verification, function selector allowlist, max trade USD, max gas USD, aggregate risk
- Hardcoded Uniswap V2/V3 + ERC20 selectors
- `SigningCoordinator.signTransaction` calls `policyEngine.check()` before signing

### What's Missing
- **`SigningCoordinator.signTransaction` is never called** — dead code
- Policy engine never invoked in actual signing path
- No per-wallet custom policy rules
- Function selector allowlist is hardcoded, not env-configurable
- No policy audit log — denied transactions throw but are not logged to DB

### Verdict
**DEAD CODE** — exists but completely bypassed by all signing operations.

---

## Rate Limiting

### What's Implemented
- Redis-backed sliding window with atomic Lua script
- Fallback to in-memory with console warning (dev/test)
- Limits on: login, MFA verify, reauth, wallet import, wallet delete, scheduler purge/start, vault unlock/lock
- `Retry-After` + `X-RateLimit-*` headers returned

### What's Missing
- **No rate limit on `/api/trades/execute-once`** — most sensitive operation, no limit
- **No rate limit on `/api/wallets/:id/approve`**
- **No rate limit on `/api/wallets/:id/revoke`**
- **No rate limit on MFA disable**
- **No rate limit on wallet key rotation**
- **No rate limit on `PATCH /api/wallets/:id`** (update wallet)

### Verdict
**Incomplete** — critical execution endpoints are unprotected.

---

## Hard Blockers in This Area

| # | Blocker | Fix Required |
|---|---------|-------------|
| H1 | Wallet pause/resume/disable have no auth | Add `requireRole("operator")` |
| H2 | Scheduler pause/stop have no auth | Add `requireRole("operator")` |
| H3 | Emergency pause enable has no auth | Add `requireRole("admin")` |
| H4 | Execute-once has no rate limit | Add rate limit: 10/min per admin |
| H5 | MFA not per-operation | Add `requireMfa()` middleware or document |
| H6 | Session role hardcoded as admin | Fetch role from DB at session creation |
| H7 | SigningCoordinator dead code | Wire into execution path |
| H8 | Signer policy engine dead code | Wire into execution path |
| H9 | External signer dead code | Wire into execution path or remove |
| H10 | Vault state per-worker memory | Use Redis for vault state |