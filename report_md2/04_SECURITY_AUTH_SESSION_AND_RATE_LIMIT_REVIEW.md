# Security Auth Session And Rate Limit Review

Date: 2026-05-20

Scope: Authentication, password hashing, sessions, CSRF, rate limits, route protection, cookies, production auth assumptions, and remaining risks.

Verdict/status: PARTIAL. Local single-operator auth is implemented and tested. Public/server-grade auth remains incomplete.

## Auth Design

- IMPLEMENTED: Single operator username/password model in `apps/api/src/auth`.
- IMPLEMENTED: Login route uses `authLoginSchema` from `packages/shared/src/schemas/auth.ts`.
- IMPLEMENTED: All `/api` routes except public auth/health routes require a session via `installAuthMiddleware`.
- IMPLEMENTED: Web `AppShell` redirects unauthenticated users to `/login`.
- PARTIAL: There are no roles, RBAC, MFA, SSO/OIDC, IP allowlist, or per-action re-auth beyond vault unlock.

## Password Hashing Implementation

- IMPLEMENTED: Argon2id hashing in `apps/api/src/auth/password.ts` with `memoryCost=65536`, `timeCost=3`, `parallelism=1`.
- IMPLEMENTED: `OPERATOR_PASSWORD_HASH` is required in production by `apps/api/src/config/env.ts`.
- PARTIAL: Legacy `sha256:` verification remains accepted with a warning for backward compatibility.
- PARTIAL: `OPERATOR_PASSWORD` remains supported outside production for local development.

## Session Store Implementation

- IMPLEMENTED: HTTP-only session cookie name `base_orchestrator_session`.
- IMPLEMENTED: Session id and CSRF token use 32 random bytes encoded base64url.
- IMPLEMENTED: Redis session store exists and production rejects localhost Redis or memory sessions.
- IMPLEMENTED: In-memory session store exists for dev/test with warnings.
- PARTIAL: Session TTL is fixed at 12 hours and there is no session management UI or forced logout on password rotation.

## CSRF Coverage

- IMPLEMENTED: Unsafe methods `POST`, `PATCH`, `PUT`, `DELETE` require `x-csrf-token`.
- IMPLEMENTED: Web API wrapper fetches `/api/auth/csrf` before unsafe requests.
- IMPLEMENTED: Integration tests cover unauthenticated mutation rejection and CSRF rejection.
- PARTIAL: `GET /api/auth/csrf` returns `{ csrfToken: undefined }` when unauthenticated; harmless, but frontend must handle it.

## Login Rate Limit

- IMPLEMENTED: Login has per-IP limit 5 per 5 minutes and per-username limit 5 per 10 minutes.
- IMPLEMENTED: Redis-backed distributed rate limit is available when non-local Redis URL is configured.
- PARTIAL: Rate limiting appears focused on login and Telegram test send; most sensitive live write endpoints rely on auth/CSRF/idempotency, not route-level throttles.

## Distributed/Redis Rate Limiting

- IMPLEMENTED: `apps/api/src/http/rate-limit-provider.ts` supports Redis sorted-set limit and in-memory fallback.
- PARTIAL: Redis fallback only warns in dev/test. Production sessions require Redis, but rate-limit provider itself falls back if Redis configured but unavailable.
- MEDIUM: For public deployment, rate limiting should fail closed or be backed by required Redis for auth and sensitive endpoints.

## Route Protection

- IMPLEMENTED: All `/api` routes except `/api/auth/login`, `/api/auth/me`, `/health`, and OPTIONS are session-protected.
- IMPLEMENTED: Mutating routes also require CSRF.
- PARTIAL: `/metrics` is not under `/api`; it has bearer-token auth only if `METRICS_TOKEN` is set.
- MEDIUM: `/metrics` open-by-default is acceptable only on localhost or private networks.

## Cookie Settings

- IMPLEMENTED: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Max-Age`.
- IMPLEMENTED: `Secure` is added in production.
- PARTIAL: Cookie domain is not set, which is usually fine for same-host local deployment but should be explicit in reverse-proxy/public hosting decisions.

## Production Auth Assumptions

- IMPLEMENTED: Production requires Argon2id password hash, disallows `OPERATOR_PASSWORD`, and requires non-default session secret.
- IMPLEMENTED: Production session store rejects localhost Redis.
- PARTIAL: Nginx adds security headers, but backend CORS only allows local web origins by port. Public domain deployment may need a reviewed origin model.
- MISSING: No account lockout administrative flow, audit review UI, MFA, or identity provider integration.

## Remaining Risks

- HIGH / PARTIAL: Single-password operator auth is not enough for exposed/public control of wallets.
- MEDIUM / PARTIAL: Sensitive live routes lack endpoint-specific rate limits.
- MEDIUM / PARTIAL: Metrics endpoint is open if token omitted.
- MEDIUM / PARTIAL: Legacy SHA-256 hash acceptance should be removed before production.
- LOW / PARTIAL: Session touch is implemented but not called in middleware, so expiration is fixed rather than sliding.

## Required Fixes

- Add route-level rate limits for vault unlock, live execute-once, approve, revoke, scheduler start, backup export/import, and emergency pause.
- Require `METRICS_TOKEN` in production or bind metrics to an internal-only listener.
- Remove legacy SHA-256 password hashes before any public server deployment.
- Add MFA or a reverse-proxy identity layer before exposing wallet control beyond localhost.
- Add auth audit views and session invalidation after password hash changes.

## Acceptance Criteria

- Tests prove unauthenticated, no-CSRF, over-rate-limit, and wrong-role requests fail for every live-impacting route.
- Production boot fails if metrics token, Redis session store, session secret, and Argon2id password hash are not configured.
- Public deployment has documented and tested origin, TLS, and identity boundaries.
