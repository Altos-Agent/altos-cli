# Auth Setup

`base-orchestrator` requires local single-operator authentication for API and dashboard access.

## Environment Variables

Required local settings:

```bash
OPERATOR_USERNAME=operator
OPERATOR_PASSWORD=change-me-local-only
SESSION_SECRET=change-this-local-session-secret-32chars
```

For any shared machine or server-like environment, use `OPERATOR_PASSWORD_HASH`
instead of `OPERATOR_PASSWORD`.

Generate an Argon2id hash locally:

```bash
pnpm auth:hash-password
```

The helper prompts for the operator password without echoing when run in an
interactive terminal and prints the encoded Argon2id hash once. Store that value
as:

```bash
OPERATOR_PASSWORD_HASH='$argon2id$...'
```

`OPERATOR_PASSWORD` is accepted only as a local-development convenience. It is
rejected in production. Do not commit real credentials.

Legacy hashes in the old `sha256:<hex>` format can still verify temporarily, but
the API emits a deprecation warning and operators should replace them with an
Argon2id hash before any shared-machine or server use.

Production startup requires both:

- `OPERATOR_PASSWORD_HASH` with an Argon2id encoded hash.
- A non-default `SESSION_SECRET` with at least 32 characters.

## Session and CSRF

- Login route: `POST /api/auth/login`
- Logout route: `POST /api/auth/logout`
- Current session route: `GET /api/auth/me`
- CSRF route: `GET /api/auth/csrf`

The API sets an HTTP-only `base_orchestrator_session` cookie with `SameSite=Lax`.

All `POST`, `PATCH`, `PUT`, and `DELETE` API requests except login require a valid session cookie and an `x-csrf-token` header.

## Rate Limiting

Login is rate-limited to prevent brute-force attacks:

- Per IP: 5 attempts per 5 minutes
- Per username: 5 attempts per 10 minutes

Failed login returns `429 Too Many Requests` with a `Retry-After` header when the limit is reached. The response does not reveal whether the username exists.

Vault unlock is also rate-limited: 5 attempts per minute per IP.

All rate limiting uses an in-memory store by default. For distributed deployments, configure `REDIS_URL` to use Redis-backed rate limiting. When Redis is unavailable or unconfigured, the system falls back to in-memory limiting with a warning logged at startup. In-memory limiting is appropriate only for local development and demo environments.

Sensitive routes (Telegram test, backup import/export, wallet operations) also have existing per-IP rate limits.

## Local Browser Notes

Use the same host style for the web app and API where possible. For example, open `http://127.0.0.1:3100` when `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4100`.

Authentication is not live-readiness approval. Live mode remains blocked by `DRY_RUN`, `DEMO_MODE`, vault lock, emergency pause, risk checks, approval policy, and the remaining live-mode checklist.