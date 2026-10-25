#!/bin/sh
set -eu

echo "→ Grand Suite API: áp dụng migration…"
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "→ Kiểm tra dữ liệu seed…"
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    prisma.organization.count()
      .then((count) => { console.log(count > 0 ? 'seed:present' : 'seed:missing'); process.exit(0); })
      .catch((error) => { console.error(error.message); process.exit(1); })
      .finally(() => prisma.\$disconnect());
  " | grep -q 'seed:missing' && ./node_modules/.bin/tsx prisma/seed.ts || echo "→ Dữ liệu đã tồn tại, bỏ qua seed."
fi

exec "$@"
