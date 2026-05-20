#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_FILE="${BACKUP_DIR}/base-orchestrator-${TIMESTAMP}.dump"

cat >&2 <<'WARNING'
WARNING:
  A database backup plus the wallet master key can compromise every imported wallet.
  Store DB backups and master keys separately.
  Encrypt backups before moving them off-host.
WARNING

mkdir -p "$BACKUP_DIR"

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="$OUTPUT_FILE"
else
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.example.yml}"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-base_orchestrator}" \
      -d "${POSTGRES_DB:-base_orchestrator}" \
      --format=custom --no-owner --no-acl > "$OUTPUT_FILE"
fi

chmod 600 "$OUTPUT_FILE"
printf 'Postgres backup written to %s\n' "$OUTPUT_FILE"
printf 'Encrypt this file and store it separately from the wallet master key.\n'
