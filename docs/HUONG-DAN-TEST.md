# Hướng dẫn mở & kiểm thử Grand Suite

## 1. Mở nhanh bằng Docker (khuyến nghị)

```bash
cd "QLDN NINHVANA"
docker compose up -d --build          # hoặc: docker-compose up -d --build
```

| Dịch vụ | URL |
|---|---|
| Giao diện | http://localhost:3000 |
| API + Swagger | http://localhost:4000/api/v1 · http://localhost:4000/api/docs |
| MailHog (email demo) | http://localhost:8025 |

Đăng nhập: `ceo@grandsuite.vn` / `GrandSuite@2026` (dùng nút tài khoản demo để đổi vai trò).
Trong container, seed tự chạy: nền tảng → 30 ngày vận hành → tài chính → 24 tháng lịch sử.

Xem trạng thái / log / dừng:

```bash
docker compose ps
docker compose logs -f api web
docker compose down          # giữ dữ liệu
docker compose down -v       # xoá cả database demo
```

## 2. Chạy local không Docker

```bash
pnpm install
pnpm setup                   # tạo .env, PostgreSQL 16 + Redis cục bộ, migrate, seed
pnpm dev                     # API :4000 · Web :3000
```

## 3. Kiểm thử tự động

```bash
pnpm lint
pnpm typecheck
pnpm test                    # 82 unit shared + 37 integration API
pnpm build

# Đo coverage lõi
pnpm --filter @grand-suite/shared test:coverage
pnpm --filter @grand-suite/api exec vitest run --coverage

# Nghiệm thu 8 tiêu chí (cần app đang chạy)
bash scripts/check-acceptance.sh          # 39/39

# 5 luồng browser e2e (cần app đang chạy)
pnpm --filter @grand-suite/web exec node e2e/flows.mjs

# Chụp lại toàn bộ ảnh 1920/768/390 + dark mode
pnpm --filter @grand-suite/web exec node e2e/screenshots.mjs
```

## 4. Kiểm thử thủ công các luồng chính

1. **Lễ tân**: `/front-desk` → Đặt phòng → nhận phòng → thêm phí → thanh toán → xuất hoá đơn.
2. **POS**: `/pos` → chọn bàn → thêm món → gửi bếp → ghi nợ phòng hoặc thanh toán; `/pos/kds` cập nhật món.
3. **Night audit**: `/night-audit` → chọn ngày → Chạy kiểm toán → xem đối soát.
4. **Kênh bán**: `/channels` → Đẩy ARI / Kéo booking; `/inbox` trả lời khách.
5. **Tài chính**: `/finance` xem P&L, cân đối, dòng tiền, AR/AP; `/payroll` tính và chi lương.
6. **Phân tích**: `/analytics` xem 24 tháng + dự báo; `/reports` chạy báo cáo và tải CSV.

## 5. Đổi màu thương hiệu

Sửa token HSL tại `apps/web/src/app/globals.css`:

- `--canvas`, `--surface`: nền trắng kem.
- `--brand`, `--brand-soft`, `--brand-foreground`: xanh khách sạn (đang là forest green).
- `--ink`, `--sidebar`: màu chữ và sidebar xanh đậm.

Sau khi sửa: `pnpm --filter @grand-suite/web build` rồi khởi động lại web.
