#!/usr/bin/env bash
# Starts PostgreSQL/Redis (local, no Docker), builds shared code and runs both apps.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "✖ Chưa có .env.local — chạy: pnpm setup"
  exit 1
fi

bash scripts/dev-db.sh start >/dev/null

if [ ! -d packages/shared/dist ]; then
  echo "→ Build @grand-suite/shared…"
  pnpm --filter @grand-suite/shared build
fi

cleanup() {
  echo ""
  echo "→ Dừng dev servers…"
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "  API  → http://127.0.0.1:4000/api/v1 (docs: /api/docs)"
echo "  Web  → http://localhost:3000"
echo ""

pnpm exec turbo run dev --parallel
