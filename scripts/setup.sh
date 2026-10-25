#!/usr/bin/env bash
# One-command local setup (no Docker required).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "  GRAND SUITE — thiết lập môi trường phát triển"
echo "  ─────────────────────────────────────────────"

command -v node >/dev/null || { echo "✖ Cần Node.js >= 22"; exit 1; }
command -v pnpm >/dev/null || { echo "✖ Cần pnpm 11 (npm i -g pnpm@11)"; exit 1; }

node scripts/generate-env.mjs
bash scripts/dev-db.sh start

echo "→ Cài dependencies…"
pnpm install

echo "→ Build package dùng chung…"
pnpm --filter @grand-suite/shared build

echo "→ Sinh Prisma client…"
pnpm --filter @grand-suite/api exec prisma generate

echo "→ Áp dụng migration…"
pnpm --filter @grand-suite/api exec prisma migrate deploy

echo "→ Seed dữ liệu demo…"
pnpm --filter @grand-suite/api seed

echo "→ Sinh 30 ngày lịch sử vận hành (doanh thu, POS, kiểm toán)…"
SEED_HISTORY_DAYS="${SEED_HISTORY_DAYS:-30}" pnpm --filter @grand-suite/api exec tsx prisma/seed-history.ts

cat <<'EOF'

  ✔ Sẵn sàng.
  Chạy:      pnpm dev
  API:       http://127.0.0.1:4000/api/v1  ·  Swagger: /api/docs
  Web:       http://localhost:3000
  Đăng nhập: ceo@grandsuite.vn / GrandSuite@2026 (xem danh sách trong README)
EOF
