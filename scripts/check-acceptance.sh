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


# ─────────────── Gate 2: PMS, POS, night audit & reconciliation ───────────────
MGR_JAR="$(mktemp)"
PROP=$(python3 - <<'PY2'
import json
with open('/tmp/gs-login.json') as handle:
    data = json.load(handle)
props = data['user']['properties']
hotel = next((p for p in props if p.get('type') == 'HOTEL'), props[0])
print(hotel['id'])
PY2
)
curl -s -o /dev/null -H "X-Forwarded-For: 10.99.2.1" -c "$MGR_JAR" -H 'Content-Type: application/json' \
  -d "{\"email\":\"manager.han@grandsuite.vn\",\"password\":\"$PASSWORD\"}" "$API/auth/login"

board=$(curl -fsS -b "$MGR_JAR" "$API/front-office/board?propertyId=$PROP" 2>/dev/null || echo '{}')
echo "$board" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = isinstance(d.get('arrivals'), list) and isinstance(d.get('inHouse'), list) and d.get('businessDate')
print(f\"  · Lễ tân: {len(d.get('arrivals',[]))} đến · {len(d.get('inHouse',[]))} đang ở · {len(d.get('departures',[]))} trả phòng\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Bàn lễ tân trả về danh sách đến/ở/đi" $?

availability=$(curl -fsS -b "$MGR_JAR" "$API/reservations/availability?propertyId=$PROP&checkIn=2026-11-10&checkOut=2026-11-12&adults=2" 2>/dev/null || echo '[]')
echo "$availability" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = isinstance(d,list) and len(d)>0 and any(r.get('available',0)>0 for r in d)
print(f\"  · Tồn phòng: {len(d)} hạng phòng\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Kiểm tra tồn phòng theo ngày" $?

outlets=$(curl -fsS -b "$MGR_JAR" "$API/pos/outlets?propertyId=$PROP" 2>/dev/null || echo '[]')
echo "$outlets" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = isinstance(d,list) and len(d)>0 and any(o.get('tables') for o in d)
print(f\"  · POS: {len(d)} outlet\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "POS outlets & sơ đồ bàn" $?

tasks=$(curl -fsS -b "$MGR_JAR" "$API/housekeeping/tasks?propertyId=$PROP" 2>/dev/null || echo '{}')
echo "$tasks" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = isinstance(d.get('items'), list) and len(d.get('items',[])) > 0
print(f\"  · Buồng phòng: {len(d.get('items',[]))} công việc\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Bảng công việc buồng phòng" $?

TODAY=$(python3 -c "import datetime; print(datetime.date.today())")
FROM=$(python3 -c "import datetime; print(datetime.date.today()-datetime.timedelta(days=29))")
recon=$(curl -fsS -b "$MGR_JAR" "$API/accounting/reconciliation?propertyId=$PROP&from=$FROM&to=$TODAY" 2>/dev/null || echo '{}')
echo "$recon" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d.get('balanced') is True and d.get('revenue',0) > 0 and abs(d.get('revenue',0)-d.get('departmentTotal',-1))<0.5 and abs(d.get('revenue',0)-d.get('channelTotal',-1))<0.5
print(f\"  · Doanh thu {d.get('revenue',0):,.0f} ₫ · bộ phận {d.get('departmentTotal',0):,.0f} ₫ · kênh {d.get('channelTotal',0):,.0f} ₫ · khớp={d.get('balanced')}\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Đối soát Dashboard = bộ phận = kênh = sổ cái" $?

audits=$(curl -fsS -b "$MGR_JAR" "$API/night-audit/latest?propertyId=$PROP" 2>/dev/null || echo '[]')
echo "$audits" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = isinstance(d,list) and any(r.get('status')=='COMPLETED' for r in d)
print(f\"  · Night audit: {len(d)} ngày đã khoá sổ\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Lịch sử Night Audit" $?


channels=$(curl -fsS -b "$MGR_JAR" "$API/channels" 2>/dev/null || echo '{}')
echo "$channels" | python3 -c "
import json,sys
d=json.load(sys.stdin)
t=d.get('totals',{})
ok = t.get('ota',0)>=8 and t.get('social',0)>=9 and t.get('mappings',0)>0
print(f\"  · Kênh: {t.get('channels',0)} · OTA {t.get('ota',0)} · social {t.get('social',0)} · mapping {t.get('mappings',0)} · DLQ {t.get('dlq',0)}\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Channel Manager: 8 OTA + 9 social + mapping" $?

inbox=$(curl -fsS -b "$MGR_JAR" "$API/inbox/conversations?page=1&pageSize=5" 2>/dev/null || echo '{}')
echo "$inbox" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = len(d.get('items',[]))>0
print(f\"  · Inbox: {d.get('total',0)} hội thoại · {d.get('counts',{}).get('open',0)} đang mở\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Social Inbox đa kênh" $?

booking=$(curl -fsS "$API/public/booking/availability?propertyCode=GSL-HAN&checkIn=2026-12-28&checkOut=2026-12-30&adults=2" 2>/dev/null || echo '{}')
echo "$booking" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = len(d.get('rooms',[]))>0
print(f\"  · Booking engine: {len(d.get('rooms',[]))} hạng phòng còn trống\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Booking engine công khai trả phòng trống" $?


TODAY_FIN=$(python3 -c "import datetime; print(datetime.date.today())")
FROM_FIN=$(python3 -c "import datetime; print(datetime.date.today().replace(day=1))")
pnl=$(curl -fsS -b "$MGR_JAR" "$API/finance/pnl?propertyId=$PROP&from=$FROM_FIN&to=$TODAY_FIN" 2>/dev/null || echo '{}')
echo "$pnl" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d.get('revenue',0)>0 and d.get('payroll',0)>0 and d.get('gop',0)>0 and d.get('gopPar',0)>0
print(f\"  · P&L: doanh thu {d.get('revenue',0):,.0f} ₫ · lương {d.get('payroll',0):,.0f} ₫ · GOP {d.get('gop',0):,.0f} ₫ · GOPPAR {d.get('gopPar',0):,.0f} ₫\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "P&L / GOP / GOPPAR từ sổ cái" $?

bs=$(curl -fsS -b "$MGR_JAR" "$API/finance/balance-sheet?propertyId=$PROP&asOf=$TODAY_FIN" 2>/dev/null || echo '{}')
echo "$bs" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d.get('balanced') is True and abs(d.get('difference',1))<1 and d.get('totalAssets',0)>0
print(f\"  · Cân đối: tài sản {d.get('totalAssets',0):,.0f} ₫ · nợ {d.get('totalLiabilities',0):,.0f} ₫ · vốn {d.get('totalEquity',0):,.0f} ₫ · lệch {d.get('difference')} ₫\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Bảng cân đối kế toán cân bằng" $?

ap=$(curl -fsS -b "$MGR_JAR" "$API/finance/ap-aging?propertyId=$PROP" 2>/dev/null || echo '{}')
echo "$ap" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d.get('total',0)>0
print(f\"  · Công nợ NCC: {d.get('total',0):,.0f} ₫ · {len(d.get('rows',[]))} hoá đơn\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Tuổi nợ phải trả nhà cung cấp" $?

payroll=$(curl -fsS -b "$MGR_JAR" "$API/hr/payroll?propertyId=$PROP" 2>/dev/null || echo '[]')
echo "$payroll" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = isinstance(d,list) and len(d)>0 and any(r.get('status') in ('POSTED','PAID') for r in d)
print(f\"  · Bảng lương: {len(d)} kỳ · {d[0].get('period') if d else '—'}\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Bảng lương đã hạch toán" $?

stock=$(curl -fsS -b "$MGR_JAR" "$API/procurement/stock?propertyId=$PROP" 2>/dev/null || echo '[]')
echo "$stock" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = isinstance(d,list) and len(d)>0 and sum(float(r.get('value',0)) for r in d)>0
print(f\"  · Kho: {len(d)} mặt hàng · giá trị {sum(float(r.get('value',0)) for r in d):,.0f} ₫\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Tồn kho & giá vốn" $?


consolidated=$(curl -fsS -b "$MGR_JAR" "$API/dashboard/consolidated" 2>/dev/null || echo '{}')
echo "$consolidated" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=d.get('metrics',{}); f=d.get('forecast',{})
ok = len(d.get('monthly',[]))>=24 and m.get('revenue',0)>0 and m.get('gop',0)>0 and m.get('gopPar',0)>0 and len(f.get('points',[]))==6 and d.get('tookMs',9999)<2000
print(f\"  · Hợp nhất: {len(d.get('monthly',[]))} tháng · doanh thu {m.get('revenue',0):,.0f} ₫ · GOP {m.get('gop',0):,.0f} ₫ · dự báo {len(f.get('points',[]))} tháng · MAPE {f.get('mape')}% · {d.get('tookMs')} ms\")
sys.exit(0 if ok else 1)
" 2>/dev/null
check "Dashboard hợp nhất 24 tháng + dự báo + <2s" $?

reports=$(curl -fsS -b "$MGR_JAR" "$API/reports/templates" 2>/dev/null || echo '[]')
echo "$reports" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"  · Report builder: {len(d)} mẫu báo cáo\")
sys.exit(0 if len(d)>=6 else 1)
" 2>/dev/null
check "Report builder templates" $?

csv=$(curl -fsS -b "$MGR_JAR" "$API/reports/export.csv?template=department&propertyId=$PROP&from=2026-10-01&to=$TODAY" 2>/dev/null | head -c 120)
echo "$csv" | grep -q "Bộ phận" && CSV_OK=0 || CSV_OK=1
echo "  · CSV header: $(echo "$csv" | head -1 | cut -c1-60)"
check "Xuất CSV báo cáo" $CSV_OK


crm=$(curl -fsS -b "$MGR_JAR" "$API/crm/segments" 2>/dev/null || echo '{}')
echo "$crm" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"  · CRM: {d.get('total',0)} khách · {len(d.get('segments',[]))} phân khúc\")
sys.exit(0 if d.get('total',0)>0 else 1)
" 2>/dev/null
check "CRM phân khúc khách hàng" $?

reviews=$(curl -fsS -b "$MGR_JAR" "$API/crm/reviews" 2>/dev/null || echo '{}')
echo "$reviews" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"  · Đánh giá: {d.get('count',0)} · trung bình {d.get('average')} sao\")
sys.exit(0 if d.get('count',0)>0 else 1)
" 2>/dev/null
check "CRM đánh giá & phản hồi" $?


sw=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/sw.js 2>/dev/null || echo 000)
manifest=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/manifest.webmanifest 2>/dev/null || echo 000)
echo "  · PWA: sw.js=$sw · manifest=$manifest"
[ "$sw" = "200" ] && [ "$manifest" = "200" ]
check "PWA service worker & manifest" $?

rm -f "$MGR_JAR"

echo ""
echo "  Kết quả: $pass đạt · $fail lỗi"
echo ""
[ "$fail" -eq 0 ]
