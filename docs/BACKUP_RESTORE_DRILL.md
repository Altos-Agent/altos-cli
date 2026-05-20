# Backup / Restore Demo Drill

## Purpose

Verify that the backup and restore system creates valid archives and can restore system state without affecting live data or real funds.

## Prerequisites

- API server running on `http://127.0.0.1:4100` (or set `API_URL` env var)
- Demo mode enabled (`DEMO_MODE=true`, default in drill)
- Login credentials: `operator` / `change-me-local-only`
- Database must be accessible
- No real funds — demo/dry-run mode only

## Run

```bash
cd /home/oguz/Masaüstü/Base-Auto-Trader
./scripts/drills/backup-restore-demo-drill.sh
```

## What It Verifies

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as operator | Session cookie obtained |
| 2 | Fetch CSRF token | Token retrieved |
| 3 | Get initial system status | Emergency pause state retrieved |
| 4 | Create database backup | Backup ID returned |
| 5 | List available backups | Backup list retrieved |
| 6 | Verify emergency pause state | `globalEmergencyPaused: false` |
| 7 | Restore backup (same data) | Restore endpoint responds |
| 8 | Verify system health | Health check returns OK |

## Expected Output

```
[INFO] Logging in as operator...
[INFO] Fetching initial system status...
[INFO] System status retrieved OK
[INFO] Creating database backup...

[PASS] Backup created with ID: <uuid>
[INFO] Listing available backups...

[PASS] Backup list retrieved successfully
[INFO] Verifying emergency pause state after backup...
[PASS] Emergency pause state confirmed OFF (safe for restore)
[INFO] Testing restore of backup (same data, demo mode)...

[PASS] Restore endpoint responded
[INFO] Verifying system is operational after drill...

[PASS] System health OK

========================================
[PASS] Backup/Restore drill completed.
Demo backup and restore operations verified.
========================================
```

## API Endpoints Used

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate as operator |
| GET | `/api/auth/csrf` | Obtain CSRF token |
| GET | `/api/emergency-pause` | Check pause state |
| POST | `/api/management/backup` | Create backup |
| GET | `/api/management/backups` | List backups |
| POST | `/api/management/restore/:id` | Restore from backup |
| GET | `/api/health` | Verify system health |

## Backup Contents

The backup API (`POST /api/management/backup`) accepts:
```json
{
  "includeTrades": true,   // Include trade history
  "includeQuotes": false   // Exclude quote cache (large, ephemeral)
}
```

## Troubleshooting

**Backup endpoint returns 404:**
Backup routes may not be registered in `server.ts`. Check that `management-routes` are imported and registered.

**Restore fails:**
Ensure no other operations are running. Restore requires emergency pause to be OFF for safety.

**Demo mode is off:**
Set `DEMO_MODE=true` before running. The drill refuses to run in production mode without `FORCE_DRILL=true`.

## Security Notes

- Drill operates on demo database only — no production data affected
- Backup archives are stored in `/tmp` and cleaned up automatically
- Cookie jar is removed on drill exit
- No real wallet private keys, seeds, or secrets are accessed
- Restore operations require explicit `confirm: true` in request body