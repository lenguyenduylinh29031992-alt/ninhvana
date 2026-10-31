#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export ALLOWED_ORIGINS="https://ninhvana.lenguyenduylinh29031992.workers.dev"
LOG="$ROOT/.dev/watchdog.log"
mkdir -p "$ROOT/.dev"
echo "[$(date '+%F %T')] watchdog started pid=$$" >> "$LOG"

port_open() { lsof -tiTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

ensure_db() {
  if ! port_open 55432 || ! port_open 56379; then
    echo "[$(date '+%F %T')] restart DB" >> "$LOG"
    bash scripts/dev-db.sh start >> "$LOG" 2>&1 || true
  fi
}
ensure_api() {
  if ! port_open 4000 || ! curl -fsS --max-time 3 http://127.0.0.1:4000/api/v1/health/live >/dev/null 2>&1; then
    echo "[$(date '+%F %T')] restart API" >> "$LOG"
    lsof -tiTCP:4000 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
    ( cd apps/api && nohup node dist/main.js >> "$LOG" 2>&1 & )
  fi
}
ensure_web() {
  if ! port_open 3000 || ! curl -fsS --max-time 3 http://127.0.0.1:3000/login >/dev/null 2>&1; then
    echo "[$(date '+%F %T')] restart web" >> "$LOG"
    lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
    ( cd apps/web && nohup pnpm start >> "$LOG" 2>&1 & )
  fi
}
ensure_tunnel() {
  local url code
  url=$(strings .dev/cloudflared.log 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)
  if [ -n "$url" ]; then
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url/login" 2>/dev/null || echo 000)
    [ "$code" = "200" ] && return
  fi
  echo "[$(date '+%F %T')] tunnel dead (${url:-none} / ${code:-000}); restarting" >> "$LOG"
  pkill -f "cloudflared tunnel .*http://127.0.0.1:3000" 2>/dev/null || true
  bash scripts/start-tunnel.sh >> "$LOG" 2>&1 || true
  url=$(strings .dev/cloudflared.log 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)
  [ -n "$url" ] || { echo "[$(date '+%F %T')] no new tunnel URL" >> "$LOG"; return; }
  python3 - "$url" <<'PY'
import pathlib, re, sys
url=sys.argv[1]
p=pathlib.Path('wrangler.toml'); s=p.read_text()
s=re.sub(r'ORIGIN_URL = "[^"]+"', f'ORIGIN_URL = "{url}"', s)
p.write_text(s)
PY
  npx --yes wrangler@latest deploy >> "$LOG" 2>&1 || true
  echo "[$(date '+%F %T')] new tunnel $url and Worker deployed" >> "$LOG"
}
while true; do
  ensure_db
  ensure_api
  ensure_web
  ensure_tunnel
  sleep 30
done
