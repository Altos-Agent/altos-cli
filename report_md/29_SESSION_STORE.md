# Session Store — Phase 4

Date: 2026-05-13
Scope: Replace in-memory session store with Redis-backed session storage.
Verdict/status: PASS.

## Summary

Session storage now has a `SessionStore` provider abstraction with Redis-backed and in-memory implementations. Production mode requires a non-localhost Redis URL. Development mode auto-detects Redis or falls back to in-memory with a warning.

## Files Changed

| File | Change |
| --- | --- |
| `apps/api/src/auth/session-store-factory.ts` | **NEW** — `SessionStore` interface, `createInMemorySessionStore`, `createRedisSessionStore`, `createSessionStore` factory |
| `apps/api/src/auth/auth-middleware.ts` | Updated to use async `SessionStore` methods |
| `apps/api/src/auth/auth-routes.ts` | Updated to await session create/delete/get |
| `apps/api/src/server.ts` | Creates `sessionStore` via factory and injects into `authContext` |

## Session Store Interface

```typescript
interface SessionStore {
  readonly name: "redis" | "memory";
  readonly isDistributed: boolean;
  create(username: string): Promise<OperatorSession>;
  get(sessionId: string | undefined): Promise<OperatorSession | null>;
  touch(sessionId: string | undefined): Promise<void>;
  delete(sessionId: string | undefined): Promise<void>;
  deleteAllSessionsForUser(username: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;
}
```

## Behavior

- **Production**: Requires `REDIS_URL` to be set and not `redis://localhost:6379`. Falls back to in-memory only if the operator explicitly overrides or the check is bypassed — which throws instead.
- **Development/Test**: Auto-detects non-localhost Redis. Falls back to in-memory with a startup warning.

## Validation

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS (125 tests, 34 files) |
| `pnpm build` | PASS |