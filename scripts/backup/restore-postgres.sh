#!/usr/bin/env sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "RESTORE_BASE_ORCHESTRATOR_DB" ]; then
  cat >&2 <<'USAGE'
Refusing to restore without confirmation.

Set:
  CONFIRM_RESTORE=RESTORE_BASE_ORCHESTRATOR_DB
  BACKUP_FILE=/path/to/base-orchestrator.dump

Restoring overwrites database state. Verify the target host, stop API/web
writers, and keep DB backups separate from the wallet master key.
USAGE
  exit 2
fi

if [ -z "${BACKUP_FILE:-}" ]; then
  echo "BACKUP_FILE is required" >&2
  exit 2
fi

cat >&2 <<'WARNING'
WARNING:
  Restoring a DB backup onto a host that also has the matching wallet master key
  restores access to encrypted wallet material.
  Store DB backups and master keys separately.
  Use encrypted backup transport and storage.
WARNING

if [ -n "${DATABASE_URL:-}" ]; then
  pg_restore "$DATABASE_URL" --clean --if-exists --no-owner --no-acl "$BACKUP_FILE"
else
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.example.yml}"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_restore -U "${POSTGRES_USER:-base_orchestrator}" \
      -d "${POSTGRES_DB:-base_orchestrator}" \
      --clean --if-exists --no-owner --no-acl < "$BACKUP_FILE"
fi

printf 'Postgres restore completed from %s\n' "$BACKUP_FILE"
