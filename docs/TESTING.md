# Chạy thử NinhVaNa

## Yêu cầu
- Node.js 24, pnpm 11
- PostgreSQL 16 + Redis 7 (hoặc Docker)

## Chạy local
```bash
pnpm install
cp .env.example .env.local
# sửa DATABASE_URL/REDIS_URL nếu không dùng cổng mặc định 55432/56379
pnpm db:start
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Tài khoản demo: `admin@ninhvana.vn` / `NinhVaNa@2026`

## Dữ liệu test
```bash
pnpm --filter @grand-suite/api exec tsx prisma/demo-test-data.ts
pnpm --filter @grand-suite/api exec tsx prisma/demo-test-data.ts --clear
```

## Thiết bị
- Android APK: `dist/NinhVaNa-0.1.0-android.apk`
- iOS Simulator: `dist/NinhVaNa-ios-simulator.zip`
- Desktop: `dist/NinhVaNa-0.1.0-macos-arm64.dmg`, `dist/NinhVaNa-0.1.0-windows-x64-setup.exe`

## Kiểm tra
```bash
pnpm lint
pnpm typecheck
pnpm build
```
