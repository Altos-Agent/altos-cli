# Local Setup

This guide targets CachyOS and other Arch-based Linux distributions. The stack is local-first: Postgres and Redis run in Docker, while the API and web app run through pnpm scripts.

## 1. Install System Packages

```bash
sudo pacman -Syu
sudo pacman -S --needed nodejs pnpm docker docker-compose git
```

Check versions:

```bash
node --version
pnpm --version
docker --version
docker compose version
```

Required versions:

- Node.js `20.11.0` or newer.
- pnpm `9.0.0` or newer.

## 2. Enable Docker

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and back in so group membership applies.

Verify Docker without sudo:

```bash
docker ps
```

## 3. Install Dependencies

```bash
pnpm install
```

## 4. Create Local Environment

```bash
cp .env.example .env
```

Keep these safety defaults unless deliberately testing a guarded live flow:

```text
DRY_RUN=true
REQUIRE_LIVE_CONFIRMATION=true
ALLOW_UNLIMITED_APPROVAL=false
AUTO_APPROVE=false
SCHEDULER_LIVE_EXECUTION=false
```

Default local ports:

- Web: `http://127.0.0.1:3100`
- API: `http://127.0.0.1:4100`
- Postgres: `localhost:5435`
- Redis: `localhost:6379`
- Optional pgAdmin: `http://localhost:5050`

`REDIS_PORT` controls the Docker host port for Redis. The local demo command uses `6380` so it can run even when another Redis service already owns `6379`.

Do not commit `.env`, `.local/master.key`, real RPC credentials, Telegram bot tokens, private keys, seed phrases, database dumps, or encrypted wallet backups.

## 5. Start Local Services

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
```

Seed data creates disabled Base token and router placeholders. Contract addresses are intentionally empty until independently verified.

View service logs:

```bash
pnpm db:logs
```

## 6. Run The App

Run API and web together:

```bash
pnpm dev
```

Or run separately:

```bash
pnpm dev:api
pnpm dev:web
```

Health checks:

```bash
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4100/api/chain/status
```

## 7. Optional pgAdmin

```bash
docker compose --profile admin up -d pgadmin
```

Open `http://localhost:5050`.

Connection settings:

- Host: `postgres`
- Port: `5432`
- Database: `base_orchestrator`
- User: `base_orchestrator`
- Password: value from `POSTGRES_PASSWORD`, default `base_orchestrator`

## 8. Validate

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm validate
docker compose config
```

Optional operator-flow E2E tests:

```bash
pnpm exec playwright install chromium
pnpm e2e
```

The E2E harness starts a demo API and web app on `127.0.0.1:4100` and `127.0.0.1:3100`. It uses seeded demo data, `DRY_RUN=true`, and local operator credentials only. The test confirms the dashboard safety badges, wallet detail flow, transaction history, demo Basescan badge, Telegram settings page, and execute-once dry-run blocking.

## 9. Stop

Stop app dev processes with `Ctrl+C`.

Stop Postgres and Redis:

```bash
pnpm db:down
```

Stop scheduler workers while API remains up:

```bash
curl -X POST http://127.0.0.1:4100/api/scheduler/stop
```

Destroy local Docker volumes only when intentionally resetting all local database/Redis data:

```bash
docker compose down -v
```
