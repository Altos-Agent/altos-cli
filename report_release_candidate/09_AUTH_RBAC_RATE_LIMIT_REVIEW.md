# 09 — Auth, RBAC, Rate Limit Review

**Date:** 2026-05-21

---

## Session Management

| Property | Value | Assessment |
|----------|-------|------------|
| Session TTL | 12 hours | Fixed, no sliding window |
| Session storage | Redis (production) | Multi-instance safe |
| Session role | Hardcoded as `"admin"` | **BUG** — always admin |
| Session refresh | `lastReauthAt` tracked | Per-op reauth, not session |
| CSRF protection | Not visibly present | Needs verification |

**Bug:** Session creation always assigns `role: "admin"` — no lookup against operator permissions. Every session is effectively an admin session regardless of the actual user role.

---

## MFA (TOTP)

| Property | Status | Notes |
|---------|--------|-------|
| TOTP RFC 6238 | ✅ | 30s window + 1-step grace |
| Recovery codes | ✅ | 8 bcrypt-hashed, single-use |
| Encrypted at rest | ✅ | AES-256-GCM + PBKDF2 |
| MFA at login | ✅ | `requiresMfa: true` + tempSessionId flow |
| MFA per-operation | ❌ | Only at login — not enforced on sensitive routes |
| MFA rate limit | ❌ | Not documented on verify endpoint |

**Verdict:** MFA is correctly implemented at the protocol level but not used as a per-operation authorization mechanism. After login, a compromised session bypasses MFA.

---

## RBAC Role Enforcement

| Role | Level | Access |
|------|-------|--------|
| viewer | 0 | Read-only routes |
| operator | 1 | Wallet import, schedule management |
| admin | 2 | All sensitive operations |

**Protected correctly:**
- `POST /api/scheduler/start` → admin
- `POST /api/scheduler/purge` → admin + reauth + phrase
- `POST /api/vault/unlock` → admin
- `POST /api/trade/execute-once` → admin + reauth + phrase
- `POST /api/wallets/:id/approve` → admin + reauth
- `POST /api/emergency-pause/disable` → admin + reauth + phrase

**Unprotected (CRITICAL — no auth at all):**
- `POST /api/scheduler/pause` → **NONE**
- `POST /api/scheduler/stop` → **NONE**
- `POST /api/emergency-pause/enable` → **NONE**
- `POST /api/wallets/:id/pause` → **NONE**
- `POST /api/wallets/:id/resume` → **NONE**
- `POST /api/wallets/:id/disable` → **NONE**
- `POST /api/wallets/:id/schedule` → **NONE**
- `POST /api/wallets/:id/emergency-pause` → **NONE**
- `PATCH /api/wallets/bulk/apply-profile` → **NONE**
- `PATCH /api/wallets/bulk/status` → **NONE**

**Verdict:** Admin routes are well-protected. Wallet and scheduler control routes are completely open.

---

## Re-Authentication

| Property | Value |
|----------|-------|
| Window | 5 minutes |
| Mechanism | Password (not TOTP) |
| Applied to | execute-once, approve, scheduler purge, emergency pause disable |
| NOT applied to | vault unlock, wallet import, wallet rotate-key |

**Verdict:** Implemented but inconsistent — some sensitive ops require it, others don't.

---

## Rate Limiting

### Correctly Implemented
- Login: 5 per 5 min per IP + 5 per 10 min per username
- MFA verify: 5 per 15 min per IP
- Reauth: 5 per 15 min per IP
- Wallet import: 10 per 15 min per IP
- Wallet delete: 5 per 15 min per IP
- Scheduler purge/start: 3 per hour per IP
- Vault unlock/lock: 5 per 15 min per IP

### Missing Rate Limits (CRITICAL)
- `POST /api/trades/execute-once` — **most sensitive endpoint, no limit**
- `POST /api/wallets/:id/approve` — admin operation, no limit
- `POST /api/wallets/:id/revoke` — sensitive, no limit
- `POST /api/auth/mfa/disable` — account security, no limit
- `PATCH /api/wallets/:id` — wallet update, no limit

**Verdict:** Auth endpoints are well-covered. Live execution endpoints are not.

---

## Hard Blockers in This Area

| # | Blocker | Fix |
|---|---------|-----|
| H1 | Session role hardcoded as admin | Fetch role from DB at session creation |
| H2 | Scheduler pause/stop have no auth | Add `requireRole("operator")` |
| H3 | Emergency pause enable no auth | Add `requireRole("admin")` |
| H4 | Wallet status mutations no auth | Add `requireRole("operator")` |
| H5 | Execute-once has no rate limit | Add rate limit: 10/min per admin |
| H6 | MFA not per-operation | Add `requireMfa()` middleware or document limitation |