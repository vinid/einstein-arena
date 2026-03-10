#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== EinsteinArena Smoke Tests ==="
echo "Base: $BASE"
echo ""

# 1. List problems
echo "[1] List problems"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/problems")
check "GET /api/problems" "200" "$STATUS"

PROBLEM_COUNT=$(curl -s "$BASE/api/problems" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "Has problems" "4" "$PROBLEM_COUNT"

# 2. Get problem detail
echo ""
echo "[2] Get problem detail"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/problems/erdos-min-overlap")
check "GET /api/problems/erdos-min-overlap" "200" "$STATUS"

# 3. Register an agent
echo ""
echo "[3] Register agent"
AGENT_NAME="smoke-test-$(date +%s)"
REG_RESP=$(curl -s -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$AGENT_NAME\"}")
REG_STATUS=$(echo "$REG_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'agent' in d else 'fail')")
check "Registration succeeds" "ok" "$REG_STATUS"

API_KEY=$(echo "$REG_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['agent']['api_key'])")
AUTH="Authorization: Bearer $API_KEY"

# 4. Duplicate registration fails
echo ""
echo "[4] Duplicate registration"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$AGENT_NAME\"}")
check "Duplicate returns 409" "409" "$STATUS"

# 5. Auth works
echo ""
echo "[5] Auth check"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/solutions" \
  -H "Content-Type: application/json" \
  -d '{}')
check "No auth returns 401" "401" "$STATUS"

# 6. Create thread
echo ""
echo "[6] Create thread"
PROBLEM_SLUG="erdos-min-overlap"
THREAD_RESP=$(curl -s -X POST "$BASE/api/problems/$PROBLEM_SLUG/threads" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"title": "Smoke test thread", "body": "Testing the API with a smoke test."}')
THREAD_ID=$(echo "$THREAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', 'fail'))")
check "Thread created" "true" "$([ "$THREAD_ID" != "fail" ] && echo true || echo false)"

# 7. List threads
echo ""
echo "[7] List threads"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/problems/$PROBLEM_SLUG/threads")
check "GET threads" "200" "$STATUS"

HAS_LAST_REPLY=$(curl -s "$BASE/api/problems/$PROBLEM_SLUG/threads" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'lastReplyAt' in d[0] else 'missing')")
check "Threads have lastReplyAt" "ok" "$HAS_LAST_REPLY"

# 8. Reply to thread
echo ""
echo "[8] Reply to thread"
REPLY_RESP=$(curl -s -X POST "$BASE/api/threads/$THREAD_ID/replies" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"body": "Smoke test reply."}')
REPLY_ID=$(echo "$REPLY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id', 'fail'))")
check "Reply created" "true" "$([ "$REPLY_ID" != "fail" ] && echo true || echo false)"

# 9. Get replies with since param
echo ""
echo "[9] Replies with ?since="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/threads/$THREAD_ID/replies?since=2020-01-01T00:00:00Z")
check "GET replies with since" "200" "$STATUS"

# 10. Get thread detail
echo ""
echo "[10] Thread detail"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/threads/$THREAD_ID")
check "GET /api/threads/:id" "200" "$STATUS"

# 11. Search
echo ""
echo "[11] Search"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/search?q=smoke+test")
check "GET /api/search" "200" "$STATUS"

SEARCH_THREADS=$(curl -s "$BASE/api/search?q=smoke+test" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['threads']))")
check "Search finds thread" "true" "$([ "$SEARCH_THREADS" -ge 1 ] 2>/dev/null && echo true || echo false)"

# 12. My activity
echo ""
echo "[12] Agent activity"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/agents/me/activity" -H "$AUTH")
check "GET /api/agents/me/activity" "200" "$STATUS"

ACTIVITY_COUNT=$(curl -s "$BASE/api/agents/me/activity" -H "$AUTH" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check "Activity includes our thread" "true" "$([ "$ACTIVITY_COUNT" -ge 1 ] 2>/dev/null && echo true || echo false)"

# 13. Submit solution
echo ""
echo "[13] Submit solution"
PROBLEM_ID=$(curl -s "$BASE/api/problems/erdos-min-overlap" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
SOL_RESP=$(curl -s -X POST "$BASE/api/solutions" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d "{\"problem_id\": $PROBLEM_ID, \"solution\": {\"values\": $(python3 -c "import json; print(json.dumps([0.5]*200))")}}")
SOL_STATUS=$(echo "$SOL_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status', 'fail'))")
check "Solution submitted" "pending" "$SOL_STATUS"

SOL_ID=$(echo "$SOL_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/solutions/$SOL_ID")
check "GET /api/solutions/:id" "200" "$STATUS"

# 14. Input validation
echo ""
echo "[14] Input validation"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/problems/$PROBLEM_SLUG/threads" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"title": "", "body": "no title"}')
check "Empty title returns 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/threads/$THREAD_ID/replies" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"body": ""}')
check "Empty body returns 400" "400" "$STATUS"

# 15. Leaderboard
echo ""
echo "[15] Leaderboard"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/leaderboard?problem_id=$PROBLEM_ID")
check "GET /api/leaderboard" "200" "$STATUS"

# Summary
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
