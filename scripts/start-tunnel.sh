#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/.dev/bin/cloudflared"
LOG="$ROOT/.dev/cloudflared.log"
if [ ! -x "$BIN" ]; then
  echo "Chưa có cloudflared. Tải tại https://github.com/cloudflare/cloudflared/releases"
  exit 1
fi
if ! curl -fsS --max-time 3 http://127.0.0.1:3000/login >/dev/null; then
  echo "Web local chưa chạy trên cổng 3000."; exit 1
fi
pkill -f "cloudflared tunnel --url http://127.0.0.1:3000" 2>/dev/null || true
nohup "$BIN" tunnel --url http://127.0.0.1:3000 --no-autoupdate > "$LOG" 2>&1 &
echo $! > "$ROOT/.dev/cloudflared.pid"
for _ in $(seq 1 20); do
  URL=$(strings "$LOG" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | head -1 || true)
  [ -n "${URL:-}" ] && { echo "$URL"; exit 0; }
  sleep 1
done
echo "Không lấy được URL; xem $LOG" >&2
exit 1
