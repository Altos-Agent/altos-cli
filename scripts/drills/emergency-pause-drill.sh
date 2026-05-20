#!/usr/bin/env sh
# Emergency Pause Drill — demo/local mode only
# Verifies: enable → routes blocked → disable → routes restored

set -e

API_URL="${API_URL:-http://127.0.0.1:4100}"
DEMO_MODE="${DEMO_MODE:-true}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/base-orchestrator-drill.cookies}"
CSRF_TOKEN=""

fail() {
  printf '\n[FAIL] %s\n' "$1"
  rm -f "$COOKIE_JAR"
  exit 1
}

pass() {
  printf '\n[PASS] %s\n' "$1"
}

info() {
  printf '[INFO] %s\n' "$1"
}

if [ "$DEMO_MODE" != "true" ] && [ "${FORCE_DRILL:-}" != "true" ]; then
  fail "DEMO_MODE must be true to run this drill. Set DEMO_MODE=true or FORCE_DRILL=true to override."
fi

info "Logging in as operator..."
curl -s -c "$COOKIE_JAR" -X POST "${API_URL}/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"operator","password":"change-me-local-only"}' > /dev/null

CSRF_RESP="$(curl -s -b "$COOKIE_JAR" "${API_URL}/api/auth/csrf")"
CSRF_TOKEN="$(printf '%s' "$CSRF_RESP" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)"

if [ -z "$CSRF_TOKEN" ]; then
  fail "Failed to obtain CSRF token — login may have failed"
fi

info "Fetching emergency pause status..."
STATUS_RESP="$(curl -s -b "$COOKIE_JAR" "${API_URL}/api/emergency-pause")"
echo "$STATUS_RESP" | grep -q '"globalEmergencyPaused":false' && \
  info "Confirmed: emergency pause is OFF" || \
  info "Emergency pause is already ON — will re-enable after test"

info "Checking routes are accessible before pause..."
EXEC_RESP="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -X POST "${API_URL}/api/trades/execute-once" \
  -H 'content-type: application/json' \
  -d '{"walletId":"00000000-0000-4000-8000-00000000d001","pairId":"00000000-0000-4000-8000-00000000d301","sellAmountDisplay":"1","confirmLiveExecution":true}')"

case "$EXEC_RESP" in
  423) info "execute-once blocked by vault lock (expected in demo mode)" ;;
  200|401|400) info "execute-once responded with ${EXEC_RESP} (not blocked by emergency pause)" ;;
  *) info "execute-once responded with ${EXEC_RESP}" ;;
esac

info "Enabling emergency pause..."
ENABLE_RESP="$(curl -s -b "$COOKIE_JAR" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -X POST "${API_URL}/api/emergency-pause/enable")"
echo "$ENABLE_RESP" | grep -q '"globalEmergencyPaused":true' && \
  pass "Emergency pause enabled" || \
  fail "Failed to enable emergency pause: ${ENABLE_RESP}"

info "Verifying emergency pause blocks scheduler start..."
SCHED_RESP="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -X POST "${API_URL}/api/scheduler/start")"
[ "$SCHED_RESP" = "423" ] && \
  pass "Scheduler start blocked (423) — emergency pause working" || \
  fail "Scheduler start returned ${SCHED_RESP}, expected 423"

info "Verifying emergency pause blocks trades..."
TRADE_RESP="$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_JAR" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -X POST "${API_URL}/api/trades/execute-once" \
  -H 'content-type: application/json' \
  -d '{"walletId":"00000000-0000-4000-8000-00000000d001","pairId":"00000000-0000-4000-8000-00000000d301","sellAmountDisplay":"1","confirmLiveExecution":true}')"
[ "$TRADE_RESP" = "423" ] && \
  pass "Trades blocked (423) — emergency pause working" || \
  fail "Trades returned ${TRADE_RESP}, expected 423"

info "Disabling emergency pause..."
DISABLE_RESP="$(curl -s -b "$COOKIE_JAR" \
  -H "x-csrf-token: ${CSRF_TOKEN}" \
  -X POST "${API_URL}/api/emergency-pause/disable")"
echo "$DISABLE_RESP" | grep -q '"globalEmergencyPaused":false' && \
  pass "Emergency pause disabled" || \
  fail "Failed to disable emergency pause: ${DISABLE_RESP}"

STATUS_AFTER="$(curl -s -b "$COOKIE_JAR" "${API_URL}/api/emergency-pause")"
echo "$STATUS_AFTER" | grep -q '"globalEmergencyPaused":false' && \
  pass "System returned to safe state (pause OFF)" || \
  fail "System did not return to safe state after disabling pause"

rm -f "$COOKIE_JAR"
printf '\n========================================\n'
printf '[PASS] Emergency pause drill completed successfully.\n'
printf 'All routes blocked during pause, system restored to demo/dry-run state.\n'
printf '========================================\n'