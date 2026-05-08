# DevOps and Local Setup Review
Date: 2026-05-08
Repository audit scope: Docker Compose, ports, Postgres/Redis, environment variables, CachyOS assumptions, startup/shutdown, logs, backup/restore, and server deployment gaps.
Verdict/status: LOCAL_DEMO_READY. Local setup is usable; production deployment is not implemented.

## Docker Compose

`docker-compose.yml` provides:

| Service | Status | Port |
|---|---|---|
| Postgres 16 alpine | IMPLEMENTED | Host `5435`, container `5432` |
| Redis 7 alpine | IMPLEMENTED | Host `${REDIS_PORT:-6379}`, container `6379` |
| pgAdmin profile | OPTIONAL | Host `5050` |

The root `pnpm demo` command uses `REDIS_PORT=6380` and `REDIS_URL=redis://localhost:6380` to reduce conflict with local Redis.

## Local Ports

| Component | Default |
|---|---|
| API | `4100` |
| Web | `3100` |
| Postgres | `5435` |
| Redis | `6379`, demo command uses `6380` |
| pgAdmin | `5050` optional |

## Environment Variables

Key safety defaults in `.env.example`:

- `DRY_RUN=true`
- `REQUIRE_LIVE_CONFIRMATION=true`
- `ALLOW_UNLIMITED_APPROVAL=false`
- `AUTO_APPROVE=false`
- `SCHEDULER_LIVE_EXECUTION=false`
- `QUOTE_PROVIDER=mock`
- `BASE_RPC_URL=https://mainnet.base.org`
- `MASTER_KEY_FILE=.local/master.key`

Gap: no env validation at API startup. Add typed env parsing with fail-fast rules.

## Startup Commands

| Command | Status | Purpose |
|---|---|---|
| `pnpm install` | IMPLEMENTED | Install workspace dependencies. |
| `pnpm db:up` | IMPLEMENTED | Start Postgres and Redis. |
| `pnpm db:migrate` | IMPLEMENTED | Apply Drizzle migrations. |
| `pnpm db:seed` | IMPLEMENTED | Seed placeholder base config. |
| `pnpm demo:seed` | IMPLEMENTED | Seed demo wallets/history/pairs. |
| `pnpm demo` | IMPLEMENTED | Start local demo stack with demo/dry-run/mock quote env. |
| `pnpm dev` | IMPLEMENTED | Run API and web. |

## Shutdown Commands

| Command | Status | Review |
|---|---|---|
| `pnpm db:down` | IMPLEMENTED | Stops compose services. |
| `docker compose down` | IMPLEMENTED | Equivalent root compose stop. |
| API/web process stop | MANUAL | Ctrl-C from dev process. |

## Logs

Status: PARTIAL. Fastify logger redaction is configured. Docker logs can be followed with `pnpm db:logs`. Missing centralized structured logs, request IDs, queue job IDs in API responses, and notification failure metrics.

## Backup and Restore

Status: PARTIAL. Docs include backup/restore guidance and wallet encrypted backup functions exist. Missing automated Postgres backup scripts, restore validation, backup encryption, and separation of DB backup from master key backup.

## CachyOS Assumptions

`docs/LOCAL_SETUP.md` targets CachyOS/Linux local setup. This is acceptable. The project should also document generic Linux/macOS port conflicts and Docker permission issues if it becomes cross-platform.

## Future Server Deployment Gaps

| Severity | Status | Gap |
|---|---|---|
| CRITICAL | MISSING | Auth/TLS/reverse proxy/firewall. |
| CRITICAL | MISSING | Production secret manager and vault. |
| HIGH | MISSING | Production Dockerfile or deployment manifests. |
| HIGH | MISSING | Backups, restore drills, and monitoring. |
| HIGH | MISSING | Queue isolation and process supervision. |
| MEDIUM | MISSING | Health checks suitable for orchestration. |

