# Deployment Server Readiness
Date: 2026-05-08
Repository audit scope: Server deployment discussion in docs, reverse proxy/TLS, firewall, Docker isolation, backups, secret management, and monitoring.
Verdict/status: MISSING. Server deployment is discussed but not implemented and should not be attempted for live funds yet.

## Current Server Deployment State

| Area | Status | Review |
|---|---|---|
| Local Docker Compose | IMPLEMENTED | Postgres/Redis only. |
| Production Dockerfile | MISSING | No API/web production container hardening. |
| Reverse proxy | MISSING | No Nginx/Caddy/Traefik config. |
| TLS | MISSING | No certificate automation. |
| Auth | MISSING | No API/web auth. |
| Secret manager | MISSING | Env/file-based secrets only. |
| Monitoring | MISSING | No metrics/alerts. |

## Nginx/Reverse Proxy Considerations

Do not expose the current API through a reverse proxy until auth and CSRF protection are implemented. When ready, terminate TLS at the proxy, restrict allowed hosts, set security headers, limit request body sizes, and route API/web separately.

## TLS

TLS is mandatory for any non-local access. Use automated certificate renewal and redirect HTTP to HTTPS. Do not send Telegram settings, wallet imports, or live confirmations over plaintext.

## Firewall

Required baseline:

- Expose only 80/443 publicly.
- Keep Postgres/Redis private.
- Restrict SSH by key and IP where possible.
- Bind API to private interface behind proxy.
- Block direct Redis/Postgres host ports.

## Docker Isolation

Current compose is local-dev oriented. Production needs:

- Non-root containers.
- Read-only filesystem where possible.
- Resource limits.
- Isolated networks.
- No bind-mounted `.local/master.key` from repo path.
- Health checks.
- Separate backup volume policy.

## Backups

Server use requires encrypted Postgres backups, separate master-key/vault backups, restore drills, and backup retention. Never store DB backups and master key in the same unprotected location.

## Secret Management

File/env secrets are not enough for live funds. Use KMS, OS keyring, cloud secret manager, or hardware-backed signing. Telegram bot token, 0x API key, RPC credentials, session keys, and vault keys need separate lifecycle policies.

## Monitoring

Minimum monitoring:

- API health and error rate.
- Queue depth and failed jobs.
- RPC latency/error rate.
- Submitted/stuck transactions.
- Confirmation failures/reverts.
- Telegram delivery failures.
- Disk space and backup success.

## Server Deployment Go/No-go

Status: NO-GO.

Server deployment can be reconsidered only after auth, vault hardening, idempotent transaction manager, live guardrail tests, TLS/proxy/firewall, backups, and monitoring are complete.

