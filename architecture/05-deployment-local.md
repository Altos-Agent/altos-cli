# Local Deployment

## Local Ports

| Service  | Default URL or port     | Config                              |
| -------- | ----------------------- | ----------------------------------- |
| Web app  | `http://127.0.0.1:3100` | `WEB_PORT`                          |
| API      | `http://127.0.0.1:4100` | `API_HOST`, `API_PORT`              |
| Postgres | `localhost:5435`        | `DATABASE_URL`, `POSTGRES_PASSWORD` |
| Redis    | `localhost:6379`        | `REDIS_URL`                         |
| pgAdmin  | `http://localhost:5050` | Docker Compose `admin` profile      |

## Docker Services

Owner file: `docker-compose.yml`.

Services:

- `postgres`: Postgres 16 Alpine, persistent `postgres-data` volume, healthcheck.
- `redis`: Redis 7 Alpine, append-only persistence, persistent `redis-data` volume, healthcheck.
- `pgadmin`: optional pgAdmin 4 behind the `admin` profile.

## Environment Variables

Owner file: `.env.example`.

Runtime:

- `NODE_ENV`
- `API_HOST`
- `API_PORT`
- `WEB_PORT`
- `NEXT_PUBLIC_API_BASE_URL`

Local services:

- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `REDIS_URL`

Network:

- `BASE_CHAIN_ID`
- `BASE_RPC_URL`
- `BASESCAN_BASE_URL`

Quotes:

- `QUOTE_PROVIDER`
- `ZEROX_API_KEY`
- `ZEROX_SWAP_QUOTE_URL`
- `ZEROX_API_VERSION`

Safety:

- `DEMO_MODE`
- `DRY_RUN`
- `REQUIRE_LIVE_CONFIRMATION`
- `ALLOW_UNLIMITED_APPROVAL`
- `AUTO_APPROVE`
- `SCHEDULER_LIVE_EXECUTION`

Secrets:

- `OPERATOR_USERNAME`
- `OPERATOR_PASSWORD`
- `OPERATOR_PASSWORD_HASH`
- `SESSION_SECRET`
- `VAULT_STORAGE_PATH`
- `MASTER_KEY_FILE`
- `VAULT_UNLOCK_PASSPHRASE`
- `VAULT_AUTO_LOCK_MS`
- `TELEGRAM_ENABLED`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Do not commit real `.env` values, private keys, bot tokens, master keys, or RPC credentials.

## Local Auth

The dashboard requires login before app routes render. The API sets an HTTP-only session cookie and requires `x-csrf-token` on mutating routes.

Local startup must provide either `OPERATOR_PASSWORD` for development or `OPERATOR_PASSWORD_HASH` for stronger local/server use. `SESSION_SECRET` must be at least 32 characters.

See `docs/AUTH_SETUP.md`.

## Startup Commands

Initial setup:

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

Open the dashboard and log in:

```text
http://127.0.0.1:3100/login
```

Run both apps:

```bash
pnpm dev
```

Run separately:

```bash
pnpm dev:api
pnpm dev:web
```

Validate:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Shutdown Commands

Stop web/API dev processes with `Ctrl+C`.

Stop local Docker services:

```bash
pnpm db:down
```

Stop scheduler workers without stopping API:

```bash
curl -X POST http://127.0.0.1:4100/api/scheduler/stop
```

Destroy local Docker volumes only when intentionally resetting local data:

```bash
docker compose down -v
```
