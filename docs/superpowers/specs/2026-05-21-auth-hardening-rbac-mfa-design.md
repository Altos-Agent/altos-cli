# Auth Hardening, RBAC, Rate Limits, and MFA — Design

**Date:** 2026-05-21
**Status:** Accepted

---

## 1. Overview

Harden authentication and authorization for the Base Orchestrator product. Add RBAC, explicit route-level rate limits, re-authentication for dangerous actions, TOTP MFA, and production-grade session management.

---

## 2. Current State

| Area | Current |
|------|---------|
| Auth | Session + CSRF; single operator |
| Rate limits | Vault unlock has per-IP 5/min; login has per-IP/user limits; approve/revoke have TODO comment but no actual limits |
| MFA | None |
| Re-auth / confirmation | Global `REQUIRE_LIVE_CONFIRMATION` env var only |
| Metrics | Optional `METRICS_TOKEN` — does not fail boot if missing |
| Roles | None |
| Session TTL | Fixed 12h |

---

## 3. RBAC Foundation

### 3.1 Roles

| Role | Permissions |
|------|-------------|
| `viewer` | Read-only. All `GET` routes only. |
| `operator` | Viewer + dry-run execution, wallet schedule management, token/pair/router enable/disable |
| `admin` | Operator + live execution, approve/revoke, backup export/import, vault unlock/lock, emergency pause disable, scheduler purge, verified token/router/pair changes, aggregate risk limit updates |

Single operator defaults to `admin` in production.

### 3.2 Session Extension

```ts
interface OperatorSession {
  id: string;
  username: string;
  role: "viewer" | "operator" | "admin";
  csrfToken: string;
  expiresAt: number;
  createdAt: number;
  lastReauthAt: number; // unix ms, 0 if never re-authed
}
```

### 3.3 Environment Variable

```
OPERATOR_ROLE=admin  # viewer | operator | admin (default: admin)
```

### 3.4 Middleware

```ts
// In request-context.ts
export const requireRole = (context: AuthContext, request: FastifyRequest, reply: FastifyReply, role: "viewer" | "operator" | "admin"): void => {
  const session = await context.sessions.get(getSessionIdFromRequest(request));
  const roleHierarchy = { viewer: 0, operator: 1, admin: 2 };
  if (roleHierarchy[session?.role ?? "viewer"] < roleHierarchy[role]) {
    return reply.code(403).send({ error: "Insufficient role" });
  }
};
```

Applied to routes as an early handler. Mutating routes (POST/PATCH/PUT/DELETE) require `operator` or `admin`. Admin-only actions are marked explicitly.

### 3.5 Role Check on All Mutating Routes

Every route handler with a mutating method (POST/PATCH/PUT/DELETE) gets `requireRole(ctx, req, reply, "operator")` at the top. Admin-only routes use `"admin"`.

---

## 4. Rate Limits

All limits are Redis-backed in production. In-memory fallback in dev. Strict routes fail **closed** (503) if Redis is unreachable in production.

### 4.1 Rate Limit Table

| Route | Limit | Window | Fail-closed |
|-------|-------|--------|-------------|
| `POST /api/vault/unlock` | 5 | 60s | No (auth-gated) |
| `POST /api/vault/lock` | 10 | 60s | No |
| `POST /api/wallets/import` | 10 | 60s | No |
| `DELETE /api/wallets/:id` | 10 | 60s | No |
| `POST /api/wallets/bulk/export-encrypted` | 5 | 60s | Yes |
| `POST /api/wallets/bulk/import-encrypted` | 5 | 60s | Yes |
| `POST /api/wallets/:id/approve` | 20/wallet | 60s | No |
| `POST /api/wallets/:id/revoke` | 20/wallet | 60s | No |
| `POST /api/trades/execute-once` | 10 | 60s | Yes |
| `POST /api/emergency-pause/disable` | 5 | 60s | Yes |
| `POST /api/scheduler/start` | 10 | 60s | No |
| `POST /api/scheduler/purge` | 3 | 60s | Yes |
| `PATCH /api/tokens/:id` | 20 | 60s | No |
| `PATCH /api/routers/:id` | 20 | 60s | No |
| `PATCH /api/pairs/:id` | 20 | 60s | No |
| `PATCH /api/risk/aggregate/limits` | 10 | 60s | Yes |
| `PUT /api/settings/telegram` | 10 | 60s | No |
| `POST /api/auth/reauth` | 10 | 60s | No |

### 4.2 Implementation

Extend the existing `RateLimitProvider.assertLimit()` pattern. For per-wallet limits, key is `ratelimit:{route}:{walletId}:{ip}`. For confirmation-required actions, add `confirm` field to request body validation.

---

## 5. Re-authentication and Typed Confirmation

### 5.1 Re-auth Window

Any dangerous action requires `session.lastReauthAt > now() - 5 minutes`. Re-authentication happens via:
- `POST /api/auth/reauth` — takes `{ password }`, updates `lastReauthAt` to `Date.now()`
- TOTP code via `reauthToken` field on the dangerous action itself (if MFA enabled)

### 5.2 Confirmation Phrases

| Action | Confirm Phrase |
|--------|----------------|
| `scheduler purge` | `"PURGE SCHEDULER QUEUES"` (already exists) |
| `emergency-pause disable` | `"DISABLE EMERGENCY PAUSE"` |
| Backup export | `"EXPORT BACKUP"` |
| Backup import | `"IMPORT BACKUP"` |
| Live execute-once | `"EXECUTE LIVE TRADE"` |
| Approve (live) | `"APPROVE LIVE"` |
| Revoke | `"REVOKE APPROVAL"` |
| Aggregate risk limit increase | `"INCREASE RISK LIMITS"` |
| Verified token/router/pair change | `"CHANGE VERIFIED STATUS"` |

### 5.3 Flow

1. Client calls dangerous action without confirmation body → `400` with `{ error: "CONFIRMATION_REQUIRED", requiredPhrase: "APPROVE LIVE" }`
2. Client re-calls with `{ ...body, confirm: "APPROVE LIVE", reauthToken?: "123456" }`
3. Server validates: role = admin, rate limit OK, re-auth window OK (or valid TOTP reauth token), phrase matches

---

## 6. MFA/TOTP — Full Implementation

### 6.1 Data Model

```ts
interface MfaSettings {
  mfaEnabled: boolean;
  totpSecretEncrypted: string | null; // AES-256-GCM encrypted, key derived from SESSION_SECRET
  mfaRecoveryCodesHashed: string[] | null; // bcrypt hash of 8 recovery codes
  mfaEnabledAt: string | null; // ISO timestamp
}
```

### 6.2 Endpoints

#### `POST /api/auth/mfa/setup`
- **Auth:** Requires full session (any role)
- **Body:** `{}`
- **Response:** `{ otpauthUri: string, qrCodeBase64: string, recoveryCodes: string[] }`
- **Logic:** Generate TOTP secret via `otplib`, store encrypted in session. Return QR code as base64 PNG via `qrcode`.

#### `POST /api/auth/mfa/verify-setup`
- **Auth:** Requires session with pending `mfaSetupToken`
- **Body:** `{ totpCode: string }`
- **Logic:** Validate TOTP code. On success, persist `mfaEnabled=true` and clear `mfaSetupToken`. Invalidate all other sessions for this user.

#### `POST /api/auth/mfa/verify`
- **Auth:** Requires `tempSessionId` from partial login
- **Body:** `{ tempSessionId: string, totpCode: string }`
- **Logic:** Validate TOTP, issue full session with role and `lastReauthAt = now()`

#### `POST /api/auth/mfa/disable`
- **Auth:** Requires full session with `mfaEnabled=true`
- **Body:** `{ totpCode: string, password: string }`
- **Logic:** Verify password + TOTP, set `mfaEnabled=false`, invalidate all sessions for user.

### 6.3 Modified Login Flow

1. `POST /api/auth/login` with correct password:
   - If MFA not enabled → issue session (current behavior)
   - If MFA enabled → issue `tempSessionId` + `{ requiresMfa: true }`
2. `POST /api/auth/mfa/verify` with valid `tempSessionId` + TOTP code → issue full session

### 6.4 Libraries

- `otplib` — TOTP generation and validation (`TOTP` class, 6-digit, 30s window, ±1 drift)
- `qrcode` — QR code generation as base64 PNG

### 6.5 Secret Storage

`totpSecretEncrypted` is encrypted with AES-256-GCM. Key is derived from `SESSION_SECRET` via PBKDF2 (100k iterations, random salt). Salt stored alongside ciphertext.

### 6.6 Recovery Codes

8 recovery codes generated at setup. Each is a random 8-character alphanumeric. Stored as bcrypt hashes. Each code can be used once. After all used, user must re-setup MFA.

---

## 7. Session Hardening

| Feature | Implementation |
|---------|----------------|
| `lastReauthAt` | Added to `OperatorSession`. Updated on password re-auth or TOTP reauth. |
| Session invalidation | Password change → `sessions.deleteAllSessionsForUser()`. MFA toggle → same. |
| Session TTL | Configurable via `SESSION_TTL_SECONDS` env. Default 43200 (12h). Min 300, Max 86400. |
| Forced logout on MFA disable | All sessions for user deleted when MFA is disabled. |
| Cookie security | `HttpOnly`, `SameSite=Lax`, `Secure` in production (already configured). |

---

## 8. Metrics Protection

**Change:** In `production` node env, `METRICS_TOKEN` is **required**.

```ts
// In metrics-routes.ts or server.ts startup
if (config.nodeEnv === "production" && config.metricsToken === null) {
  throw new Error(
    "METRICS_TOKEN is required in production. " +
    "The /metrics endpoint cannot be exposed without authentication. " +
    "Set METRICS_TOKEN in your environment."
  );
}
```

This throws synchronously at boot time. If Redis is also unavailable in production, sessions also fail boot (already implemented).

---

## 9. Frontend Changes

### 9.1 Role Badge
- Next to operator name in sidebar — chip showing `ADMIN` / `OPERATOR` / `VIEWER`

### 9.2 Security Settings Page (`/settings/security`)
- MFA status (enabled/disabled)
- If disabled: "Enable MFA" button → triggers setup flow with QR code
- If enabled: shows recovery codes (one-time reveal), "Disable MFA" button
- Re-authenticate section: "Re-authenticate" button → password re-auth modal

### 9.3 Re-auth Modal
- Shown when attempting a dangerous action with stale `lastReauthAt`
- Password input + optional TOTP input
- On success: action proceeds, modal closes

### 9.4 Confirmation Modal
- Shown for actions with typed phrase requirement
- Displays action description + text input for phrase
- Submit enabled only when phrase matches exactly

### 9.5 Rate Limit Error Display
- Parse `Retry-After` header from 429 responses
- Show toast: "Too many requests. Please wait X seconds."

---

## 10. Tests

| Test File | Description |
|-----------|-------------|
| `rbac.test.ts` | Viewer GET ok, viewer POST → 403. Operator POST to admin-only route → 403. Admin with confirmation → 200. |
| `rate-limits.test.ts` | 6 vault unlock calls → 429 on 6th. 11 execute-once calls → 429 on 11th. |
| `reauth.test.ts` | Dangerous action without recent reauthAt → 400 CONFIRMATION_REQUIRED. With reauth + confirm → 200. |
| `mfa.test.ts` | Full flow: setup → verify → login challenge → MFA verify → full session. Recovery code use. |
| `session-hardening.test.ts` | Password change invalidates all sessions. MFA disable invalidates all sessions. |
| `metrics-protection.test.ts` | `NODE_ENV=production` without `METRICS_TOKEN` → throws RuntimeEnvError at parse time. |
| `security.integration.test.ts` (existing) | Extend: CSRF still enforced, unauthenticated routes still 401. |

---

## 11. File Changes Summary

### Backend (apps/api/src/)

| File | Changes |
|------|---------|
| `auth/session-store-factory.ts` | Add `role` (default "admin") and `lastReauthAt` (default 0) to OperatorSession |
| `auth/auth-routes.ts` | Add `/auth/reauth`, `/auth/mfa/setup`, `/auth/mfa/verify-setup`, `/auth/mfa/verify`, `/auth/mfa/disable` |
| `http/request-context.ts` | Add `requireRole()` helper; `getSessionRole()`; `requireReauth()`; `requireConfirmation()` |
| `http/rate-limit-provider.ts` | Add `assertLimitOrFailClosed()` variant for strict routes; per-wallet limit helper |
| `vault/vault-routes.ts` | Add strict rate limit on unlock; role check (admin) |
| `approvals/approval-routes.ts` | Add per-wallet rate limit; role check (admin); confirmation + reauth check |
| `trades/trade-routes.ts` | Add rate limit; role check (admin); reauth check for live execution |
| `scheduler/scheduler-routes.ts` | Add rate limit on start/purge; role check (admin); confirmation on purge |
| `security/emergency-pause-routes.ts` | Add rate limit; role check (admin); confirmation on disable |
| `wallets/wallet-routes.ts` | Add rate limit on import/delete/export; role check (operator) |
| `management/management-routes.ts` | Add rate limit; role check (operator for enable/disable, admin for verified changes) |
| `risk-routes.ts` | Add rate limit; role check (admin) on PATCH |
| `ops/metrics-routes.ts` | Add production-only METRICS_TOKEN check |
| `config/env.ts` | Add `OPERATOR_ROLE`, `SESSION_TTL_SECONDS`, `TOTP_ISSUER` env vars |
| `config/runtime-config.ts` | Export new config fields |
| `notifications/telegram-routes.ts` | Add rate limit; role check (operator) |
| `db/schema.ts` | Add MFA fields to `operator_settings` table if applicable |

### Frontend (apps/web/)

| File | Changes |
|------|---------|
| `components/role-badge.tsx` | New — role chip component |
| `components/reauth-modal.tsx` | New — password/TOTP modal for re-auth |
| `components/confirmation-modal.tsx` | New — typed phrase confirmation |
| `components/mfa-setup-dialog.tsx` | New — MFA setup wizard with QR code |
| `components/security-settings.tsx` | New — security settings page |
| `lib/api.ts` | Add `POST /api/auth/mfa/*`, `POST /api/auth/reauth` |
| `lib/types.ts` | Add `OperatorRole`, `MfaSettings`, `ReauthStatus` types |
| `lib/nav.ts` | Add `/settings/security` route |
| `components/app-shell.tsx` | Add role badge next to operator name |
| `components/vault-controls.tsx` | Use confirmation modal for vault operations |
| `components/scheduler-controls.tsx` | Use confirmation modal for purge |
| `components/emergency-pause-button.tsx` | Use confirmation + re-auth for disable |
| `components/execute-once-card.tsx` | Re-auth + confirm for live execution |

### Docs

| File | Description |
|------|-------------|
| `docs/RBAC_AND_OPERATOR_SECURITY.md` | RBAC model, role permissions, session management |
| `docs/SENSITIVE_ROUTE_RATE_LIMITS.md` | Rate limit table, fail-closed rationale, Redis requirements |
| `docs/MFA_SETUP.md` | TOTP setup flow, recovery codes, secret storage |

---

## 12. Dependencies

New npm packages for backend:
- `otplib` ^7.x — TOTP generation/validation
- `qrcode` ^1.x — QR code PNG generation

No new infrastructure dependencies. Existing Redis is used for rate limits and sessions.