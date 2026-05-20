# DevOps Local Server Deployment And Backup Review

Date: 2026-05-20

Scope: Local setup, Linux notes, Docker Compose, Postgres/Redis, env validation, production Dockerfiles, nginx, TLS/firewall assumptions, secrets, backup/restore scripts, drills, and server deployment readiness.

Verdict/status: PARTIAL. Local and container foundations exist. Server deployment is not ready for live funds or public exposure.

## Local Setup

- IMPLEMENTED: README and `docs/LOCAL_SETUP.md` describe `pnpm install`, `.env`, `pnpm db:up`, migrations, seed, test, dev.
- IMPLEMENTED: `pnpm demo` starts local Postgres/Redis with demo/dry-run/mock settings.
- IMPLEMENTED: Default API host is `127.0.0.1`.

## CachyOS/Linux Notes

- UNCLEAR: Docs mention local/Linux operations generally; no CachyOS-specific hardening was identified in inspected summaries.

## Docker Compose Local

- IMPLEMENTED: `docker-compose.yml` starts Postgres 16, Redis 7, optional pgAdmin.
- IMPLEMENTED: Postgres and Redis have healthchecks and volumes.
- PARTIAL: pgAdmin profile uses default local credentials unless overridden.

## Postgres/Redis Setup

- IMPLEMENTED: DB URL and Redis URL are env-configured.
- IMPLEMENTED: Redis is used for BullMQ queues and can back sessions/rate limits.
- PARTIAL: Local development defaults use localhost Redis and memory fallback warnings in tests.

## Env Validation

- IMPLEMENTED: `apps/api/src/config/env.ts` centralizes runtime validation.
- IMPLEMENTED: Production requires Argon2id password hash and non-default session secret.
- IMPLEMENTED: Production live mode rejects `VAULT_PROVIDER=local-file`.
- IMPLEMENTED: Demo mode requires dry-run; scheduler live conflicts are rejected.

## Production Dockerfiles

- IMPLEMENTED: `apps/api/Dockerfile` builds TypeScript output, deploys production deps, runs as non-root `baseapp`, exposes 4100, has healthcheck.
- IMPLEMENTED: `apps/web/Dockerfile` builds Next standalone output, runs as non-root `baseapp`, exposes 3100, has healthcheck.
- VALIDATED: Web Docker image built successfully.
- VALIDATED: API Docker image built successfully after retry due npm registry timeout.
- PARTIAL: API build emitted `pnpm deploy` bin-link warnings; image export succeeded, but runtime smoke was not performed in this audit.

## Nginx/Reverse Proxy

- IMPLEMENTED: `infra/nginx/nginx.conf` proxies `/api`, `/health`, and web.
- IMPLEMENTED: TLS, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP are configured.
- PARTIAL: CSP allows `'unsafe-inline'` and `'unsafe-eval'`, common for Next but should be tightened for production if possible.
- PARTIAL: TLS files are placeholders and require real certificates.

## TLS/Firewall Assumptions

- OPERATOR_REQUIRED: Bind public ports only after auth, TLS, secrets, and custody are hardened.
- OPERATOR_REQUIRED: Firewall should restrict Postgres/Redis to private network only.
- IMPLEMENTED: Production Compose backend network is internal.

## Secrets Management

- PARTIAL: Production Compose uses env substitution but placeholder defaults remain.
- HIGH: Server deployments must not use placeholder password hash/session secret/database password.
- HIGH: Local-file master key volume is not acceptable for meaningful funds.
- MISSING: No secret manager integration for production.

## Backup/Restore Scripts

- PARTIAL: `scripts/backup/backup-postgres.sh` and `restore-postgres.sh` exist.
- PARTIAL: `scripts/backup/backup-wallet-vault-warning.md` warns about wallet vault.
- NOT_TESTED: Backup/restore scripts were not run in this audit.

## Backup/Restore Drill

- PARTIAL: Drill docs and scripts exist.
- NOT_TESTED: Drill not run due report-only boundary.

## Emergency Pause Drill

- PARTIAL: Drill docs and scripts exist.
- NOT_TESTED: Drill not run in this audit.

## Server Deployment Readiness

- Local/private dry-run server: PARTIAL, viable after replacing placeholders.
- Public server with no funds: PARTIAL, needs hardened auth, metrics token, TLS certs, backups, monitoring.
- Public server with meaningful funds: FAIL, custody and live ops not ready.

## Deployment Blockers

- HIGH / OPERATOR_REQUIRED: Replace all placeholder secrets.
- HIGH / PARTIAL: Use Redis-backed sessions and rate limits.
- HIGH / PARTIAL: Require metrics token/internal metrics routing.
- HIGH / MISSING: Real custody provider for meaningful funds.
- HIGH / NOT_TESTED: Backup/restore and emergency pause drills not run.
- MEDIUM / PARTIAL: CI Docker smoke should fail on runtime startup problems rather than tolerate `|| true`.

## Acceptance Criteria

- `docker compose -f docker-compose.prod.example.yml config --quiet` passes with real env.
- API/web images build and run healthchecks.
- Production boot refuses placeholder secrets.
- Backup/restore drill and emergency pause drill pass on a disposable environment.
- No public exposure until monitoring and auth gates pass.
