# Server Deployment Preparation

Status: preparation only. Do not use this stack for live funds until
`docs/SERVER_DEPLOYMENT_CHECKLIST.md` is complete and signed off.

## Safety Defaults

The production example defaults to:

- `DEMO_MODE=true`
- `DRY_RUN=true`
- `SCHEDULER_LIVE_EXECUTION=false`
- `AUTO_APPROVE=false`
- `ALLOW_UNLIMITED_APPROVAL=false`
- `QUOTE_PROVIDER=mock`

Do not change these for a server until auth, TLS, backups, monitoring, vault
policy, and live-mode guardrails have been reviewed.

## Network Boundary

Expose only:

- `80/tcp` for ACME HTTP challenge or redirect.
- `443/tcp` for HTTPS.

Keep private:

- Postgres `5432`.
- Redis `6379`.
- API `4100`.
- Web `3100`.

The API must stay behind the reverse proxy. Do not publish API, Postgres, or
Redis ports directly from Docker Compose.

## SSH and Firewall

Baseline firewall policy:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow from <trusted-admin-ip> to any port 22 proto tcp
ufw enable
```

Use SSH keys only. Disable password login and root login in `sshd_config`.
Restrict SSH by source IP where possible.

## Reverse Proxy and TLS

Example config lives in `infra/nginx/nginx.conf`.

Requirements before public access:

- Replace TLS placeholders with real certificates.
- Automate certificate renewal.
- Set an explicit `server_name`.
- Keep security headers enabled.
- Keep `client_max_body_size` small unless a reviewed backup/import flow needs
  more.

## Secrets

Do not store production secrets in the repository or image.

Use a secret manager, KMS, OS keyring, or hardware-backed signing policy for:

- Operator password hash.
- Session secret.
- Telegram bot token.
- RPC provider credentials.
- 0x API key.
- Wallet vault master key.

File/env secrets are acceptable only for local demo or temporary dry-run
testing. They are not acceptable for live funds.

## Backups

Scripts:

- `scripts/backup/backup-postgres.sh`
- `scripts/backup/restore-postgres.sh`
- `scripts/backup/backup-wallet-vault-warning.md`

Rules:

- DB backup plus wallet master key equals wallet compromise.
- Store DB backups and the master key separately.
- Encrypt backups before moving them off-host.
- Test restore with demo wallets.
- Back up Docker volumes: `postgres-data`, `redis-data`, and `api-vault`.

## Health and Operations

Health endpoints:

- `GET /health`: public container/proxy health. Reports DB, Redis, and RPC
  status without leaking secrets.
- `GET /api/ops/summary`: authenticated operator summary with queue,
  notification, vault, runtime, emergency-pause, and dependency status.

Monitoring should alert on:

- `/health` degraded or down.
- API 5xx rate.
- Queue depth and failed jobs.
- RPC degraded status.
- Submitted/stuck transactions.
- Telegram delivery failures.
- Disk space and backup success.

## Example Validation

```bash
docker build -f apps/api/Dockerfile -t base-orchestrator-api:dry-run .
docker build -f apps/web/Dockerfile -t base-orchestrator-web:dry-run .
docker compose -f docker-compose.prod.example.yml config
```

Passing these commands means deployment artifacts render and build. It does not
mean the system is ready for live funds.
