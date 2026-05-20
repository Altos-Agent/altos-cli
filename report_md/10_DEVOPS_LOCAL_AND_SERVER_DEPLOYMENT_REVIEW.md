# DevOps Local And Server Deployment Review

Date: 2026-05-13  
Scope: Local setup, Docker Compose, env variables, production Dockerfiles, reverse proxy, TLS/firewall assumptions, backup/restore, and server readiness.  
Verdict/status: LOCAL_DEMO_READY; SERVER_DEPLOYMENT_NOT_READY for live funds.

## Local Setup

`README.md`, `docs/LOCAL_SETUP.md`, and root scripts support local Postgres/Redis, migrations, seed/demo seed, API, web, and demo mode. Root `pnpm demo` defaults to demo/dry-run/mock quote provider and demo credentials.

## CachyOS / Linux Assumptions

Linux local development is documented generally. No CachyOS-specific blocker was found in the inspected docs. Docker and pnpm are expected.

## Docker Compose Local

`docker-compose.yml` defines Postgres 16 on `5435` and Redis 7 on `${REDIS_PORT:-6379}` with healthchecks and named volumes. `docker compose config` passed.

## Postgres / Redis Setup

Postgres and Redis are local services. API config uses `DATABASE_URL` and Redis URL/host/port fields. Integration tests use in-memory/test helpers, not live funds.

## Env Variables

`.env.example` is conservative:
- `DEMO_MODE=true`
- `DRY_RUN=true`
- `REQUIRE_LIVE_CONFIRMATION=true`
- `ALLOW_UNLIMITED_APPROVAL=false`
- `AUTO_APPROVE=false`
- `SCHEDULER_LIVE_EXECUTION=false`
- `NATIVE_VALUE_SWAPS_ENABLED=false`
- `QUOTE_PROVIDER=mock`

Production secrets are placeholders and must be replaced outside git.

## Production Dockerfiles

`apps/api/Dockerfile` and `apps/web/Dockerfile` exist. API runs as non-root and defaults demo/dry-run. Web uses Next standalone. Docker image builds were NOT_TESTED in this audit because build commands write artifacts and may be slow/network-dependent under report-only scope.

## Reverse Proxy / Nginx

`infra/nginx/nginx.conf` exists and production compose wires nginx to web/API over internal networks. TLS files are placeholders under `infra/nginx/tls`.

## TLS / Firewall Assumptions

`docs/SERVER_DEPLOYMENT.md` documents only ports 80/443 exposed, private DB/Redis/API/web, SSH key-only access, restricted SSH source IP, TLS certificate replacement, and security headers. These are docs/examples, not verified server state.

## Backup / Restore Scripts

`scripts/backup/backup-postgres.sh`, `restore-postgres.sh`, and `backup-wallet-vault-warning.md` exist. Backup/restore was NOT_TESTED in this audit. Restore drills are required before live funds.

## Docker Build / Smoke Results

| Command | Result |
| --- | --- |
| `docker compose config` | PASS |
| `docker compose -f docker-compose.prod.example.yml config` | PASS |
| `pnpm docker:build:api` | NOT_TESTED |
| `pnpm docker:build:web` | NOT_TESTED |

## Server Deployment Readiness

Server deployment for demo/dry-run review is a preparation artifact. Server deployment with live funds is not ready because secrets are placeholders, auth is local-first, sessions/rate limits are in-memory, TLS/cert renewal are not configured, backups are not drilled, monitoring is not implemented, and custody is local-file based.

## What Blocks Server Deployment With Live Funds

1. Production secret management.
2. Adaptive password hash and login rate limit.
3. TLS/cert renewal/firewall verification.
4. Backup/restore drill.
5. Monitoring/alerting.
6. KMS/HSM/MPC/hardware wallet custody.
7. Live token/router/provider verification.
8. Incident response and nonce/replacement runbooks.

