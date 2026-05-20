# Emergency Pause Drill

## Purpose

Verify that the emergency pause system correctly blocks all trade execution, scheduler start, and approval flows when enabled, and restores normal operation when disabled.

## Prerequisites

- API server running on `http://127.0.0.1:4100` (or set `API_URL` env var)
- Demo mode enabled (`DEMO_MODE=true`, default in drill)
- Login credentials: `operator` / `change-me-local-only`
- No real funds — demo/dry-run mode only

## Run

```bash
cd /home/oguz/Masaüstü/Base-Auto-Trader
./scripts/drills/emergency-pause-drill.sh
```

## What It Verifies

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login as operator | Session cookie obtained |
| 2 | Fetch CSRF token | Token retrieved |
| 3 | Check initial pause status | `globalEmergencyPaused: false` |
| 4 | Check routes accessible before pause | `execute-once` responds (200/401/400/423) |
| 5 | Enable emergency pause | `globalEmergencyPaused: true` |
| 6 | Try scheduler start while paused | HTTP 423 — blocked |
| 7 | Try trade execution while paused | HTTP 423 — blocked |
| 8 | Disable emergency pause | `globalEmergencyPaused: false` |
| 9 | Verify system restored | Routes return to normal state |

## Expected Output

```
[INFO] Logging in as operator...
[INFO] Fetching emergency pause status...
[INFO] Confirmed: emergency pause is OFF
[INFO] Checking routes are accessible before pause...
[INFO] execute-once responded with 200 (not blocked by emergency pause)
[INFO] Enabling emergency pause...

[PASS] Emergency pause enabled
[INFO] Verifying emergency pause blocks scheduler start...
[PASS] Scheduler start blocked (423) — emergency pause working
[INFO] Verifying emergency pause blocks trades...
[PASS] Trades blocked (423) — emergency pause working
[INFO] Disabling emergency pause...

[PASS] Emergency pause disabled
[PASS] System returned to safe state (pause OFF)

========================================
[PASS] Emergency pause drill completed successfully.
All routes blocked during pause, system restored to demo/dry-run state.
========================================
```

## HTTP Response Codes

| Code | Meaning |
|------|---------|
| 200 | Success (route not blocked) |
| 401 | Unauthorized (no session) |
| 423 | Locked — emergency pause is blocking this route |
| 400 | Bad request (expected in demo mode) |

## Troubleshooting

**423 not returned when pause enabled:**
Check that `globalEmergencyPaused` is set to `true` in the database and the emergency pause middleware is loaded in `server.ts`.

**Login fails (401):**
Verify demo credentials in `.env` or demo data seed in `apps/api/src/db/demo-data.ts`.

**Demo mode is off:**
Set `DEMO_MODE=true` before running the drill. The drill refuses to run in production mode without `FORCE_DRILL=true`.

## Security Notes

- Drill uses demo credentials only — no real wallet private keys exposed
- All blockchain interactions are simulated in demo mode
- No mainnet tokens or contracts are referenced
- Cookie jar is cleaned up automatically on exit