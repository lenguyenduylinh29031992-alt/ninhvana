#!/usr/bin/env bash
# Gate 1 acceptance checks: health, demo role sign-in, seeded data, audit chain.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${API_URL:-http://127.0.0.1:4000/api/v1}"
PASSWORD="${SEED_ADMIN_PASSWORD:-GrandSuite@2026}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

pass=0
fail=0
check() {
  local label="$1" ok="$2"
  if [ "$ok" = "0" ]; then
    printf "  ✔ %s\n" "$label"
    pass=$((pass + 1))
  else
    printf "  ✖ %s\n" "$label"
    fail=$((fail + 1))
  fi
}

echo ""
echo "  GRAND SUITE — kiểm tra nghiệm thu (Gate 1)"
echo "  ────────────────────────────────────────────"

curl -fsS "$API/health/live" >/dev/null 2>&1
check "API health endpoint" $?

health=$(curl -fsS "$API/health" 2>/dev/null || echo '{}')
echo "$health" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d.get('status') == 'ok' and all(c.get('status') == 'up' for c in d.get('components', []))
sys.exit(0 if ok else 1)
" 2>/dev/null
check "PostgreSQL + Redis healthy" $?

ACCOUNTS=(
  admin chairman ceo cfo revenue hr marketing
  manager.han manager.dan frontdesk housekeeping chef fnb cashier warehouse
)
i=0
for account in "${ACCOUNTS[@]}"; do
  i=$((i + 1))
  code=$(curl -s -o /tmp/gs-login.json -w "%{http_code}" \
    -H "X-Forwarded-For: 10.99.0.$i" \
    -c "$JAR" -H 'Content-Type: application/json' \
    -d "{\"email\":\"${account}@grandsuite.vn\",\"password\":\"$PASSWORD\"}" \
    "$API/auth/login")
  token_ok=$(grep -c 'gs_at' "$JAR" || true)
  if [ "$code" = "200" ] && [ "$token_ok" -gt 0 ]; then
    check "Đăng nhập ${account}@grandsuite.vn" 0
  else
    check "Đăng nhập ${account}@grandsuite.vn (HTTP $code)" 1
  fi
done

# Re-authenticate as a group administrator for portfolio-wide figures.
curl -s -o /dev/null -H "X-Forwarded-For: 10.99.1.1" -c "$JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@grandsuite.vn\",\"password\":\"$PASSWORD\"}" "$API/auth/login"

stats=$(curl -fsS -b "$JAR" "$API/dashboard/stats" 2>/dev/null || echo '{}')
echo "$stats" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d.get('properties',0) >= 2 and d.get('rooms',0) >= 250 and d.get('users',0) >= 15 and d.get('roles',0) >= 14
print(f\"  · {d.get('properties')} cơ sở · {d.get('rooms')} phòng · {d.get('users')} tài khoản · {d.get('roles')} vai trò · {d.get('ratePlans')} gói giá\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Dữ liệu nền (2 cơ sở, 250 phòng, 15 tài khoản)" $?

chain=$(curl -fsS -b "$JAR" "$API/audit/verify" 2>/dev/null || echo '{}')
echo "$chain" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d.get('valid') is True and d.get('checked',0) > 0
print(f\"  · Chuỗi băm: {d.get('checked')} bản ghi, hợp lệ={d.get('valid')}\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Nhật ký kiểm toán toàn vẹn" $?

echo ""
echo "  Kết quả: $pass đạt · $fail lỗi"
echo ""
[ "$fail" -eq 0 ]
