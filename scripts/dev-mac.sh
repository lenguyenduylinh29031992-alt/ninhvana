#!/usr/bin/env bash
# NinhVaNa — Mac-only development/staging server.
# Uses the isolated local cluster in .dev/ and never connects to production SQL.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "✖ Chưa có .env.local. Chạy: pnpm setup" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env.local
set +a
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -n "$LAN_IP" ]; then
  export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-},http://$LAN_IP:3000"
fi
case "${DATABASE_URL:-}" in
  *"@127.0.0.1:55432/"*|*"@localhost:55432/"*) ;;
  *) echo "✖ DATABASE_URL local không phải PostgreSQL .dev (127.0.0.1:55432). Từ chối chạy để bảo vệ production." >&2; exit 1 ;;
esac

echo "→ Khởi động PostgreSQL/Redis local (.dev, không phải production)…"
bash scripts/dev-db.sh start

if [ ! -d packages/shared/dist ]; then
  echo "→ Build @grand-suite/shared…"
  pnpm --filter @grand-suite/shared build
fi

API_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
echo ""
echo "  Mac dev API : http://127.0.0.1:4000/api/v1"
echo "  Mac dev Web : http://localhost:3000"
if [ -n "$API_IP" ]; then
  echo "  Qua Tailscale: http://$API_IP:3000"
fi
echo "  Database    : PostgreSQL local port 55432 (tách biệt production)"
echo "  Dừng       : Ctrl+C"
echo ""

# Local-only URLs must be set in .env.local. Do not use the production Funnel here.
exec pnpm dev
