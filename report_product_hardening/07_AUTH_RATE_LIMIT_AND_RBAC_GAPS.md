# Auth Rate Limit And RBAC Gaps

Date: 2026-05-20

Scope: Auth, session, CSRF, route protection, rate limits, RBAC/operator roles, sensitive route controls, and production auth assumptions.

Verdict/status: MEDIUM / PARTIAL. Local single-operator auth is implemented. Route-level throttling and RBAC are not yet product-grade.

## Current Implementation

- IMPLEMENTED: `apps/api/src/auth/password.ts` supports Argon2id hash verification and legacy SHA-256 compatibility.
- IMPLEMENTED: `apps/api/src/auth/auth-routes.ts` provides login/logout/me/csrf and rate-limits login by IP and username.
- IMPLEMENTED: `apps/api/src/auth/auth-middleware.ts` protects API routes, enforces CSRF on unsafe methods, sets local CORS, and uses HttpOnly SameSite cookies.
- IMPLEMENTED: `apps/api/src/auth/session-store.ts` and `session-store-factory.ts` support sessions.
- IMPLEMENTED: `apps/api/src/http/rate-limit-provider.ts` supports Redis-backed distributed rate limiting with memory fallback.
- IMPLEMENTED: `apps/api/src/vault/vault-routes.ts` rate-limits vault unlock.

## Gaps

- HIGH / MISSING: No RBAC roles. All authenticated users are effectively the same operator.
- HIGH / PARTIAL: Sensitive mutation endpoints do not have explicit route-level throttles: execute-once, approve, revoke, emergency pause enable/disable, scheduler start/pause/stop/purge, token/router/pair mutation, wallet import/status changes, Telegram settings.
- HIGH / PARTIAL: Redis rate limiter falls back to memory if Redis is localhost/unconfigured/unreachable. Production should fail closed or warn as deployment blocker for public/server mode.
- MEDIUM / PARTIAL: `/api/auth/me` is public by design to support UI session detection, but should remain carefully reviewed.
- MEDIUM / MISSING: No account lockout/audit escalation beyond metrics for repeated login failures.
- MEDIUM / MISSING: No role split for viewer/operator/admin/security approver.

## Exact Files Likely Touched

- `apps/api/src/auth/auth-middleware.ts`
- `apps/api/src/auth/auth-routes.ts`
- `apps/api/src/auth/session-store.ts`
- `apps/api/src/http/rate-limit-provider.ts`
- `apps/api/src/http/rate-limit.ts`
- `apps/api/src/server.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/approvals/approval-routes.ts`
- `apps/api/src/security/emergency-pause-routes.ts`
- `apps/api/src/scheduler/scheduler-routes.ts`
- `apps/api/src/management/management-routes.ts`
- `apps/api/src/wallets/wallet-routes.ts`
- `apps/api/src/notifications/telegram-routes.ts`
- `apps/api/src/ops/alert-webhook.ts`
- `packages/shared/src/schemas/auth.ts`
- `apps/web/app/login/page.tsx`
- `apps/web/components/*`

## Acceptance Criteria

- HIGH: Sensitive routes have named rate-limit policies with tests.
- HIGH: Server/production mode refuses memory-only rate limiting unless explicitly acknowledged for private dry-run deployments.
- HIGH: RBAC separates at least viewer, operator, and admin/security-confirm roles before meaningful funds.
- HIGH: Dangerous routes require CSRF, auth, idempotency where relevant, confirmation strings/booleans, and rate limits.
- MEDIUM: Failed login and repeated sensitive-action rejections trigger alert hooks.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/auth/security.integration.test.ts apps/api/src/http/rate-limit-provider.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/schemas/route-validation.integration.test.ts
pnpm test
```
