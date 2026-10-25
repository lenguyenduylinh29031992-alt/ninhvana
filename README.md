# Grand Suite

**Hệ thống Quản trị Doanh nghiệp Khách sạn & Nhà hàng 5 sao** — PMS, POS, Channel Manager, Revenue, Cost, HRM, Finance, CRM và BI trong một nền tảng đa cơ sở.

![Grand Suite — Trung tâm điều hành](docs/evidence/dashboard-1920.png)

> Đa cơ sở · Đa kênh · Tài chính hợp nhất theo thời gian thực · Giao diện tiếng Việt / English

---

## Trạng thái dự án

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0 | Kế hoạch, kiến trúc, ERD, backlog | ✅ Hoàn tất |
| 1 | Nền tảng: monorepo, DB, auth/2FA, RBAC, audit, design system, seed | ✅ Hoàn tất (Gate 1) |
| 2 | PMS + Folio + POS + Night Audit + Revenue posting | ✅ Hoàn tất (Gate 2) |
| 3 | Channel Manager, Booking Engine, Social Inbox, Attribution | ✅ Hoàn tất (Gate 3) |
| 4 | Chi phí, mua hàng, kho, HRM, lương, P&L | ⏳ Tiếp theo |
| 5 | Dashboard KPI đầy đủ, report builder, AI, dự báo | ⬜ |
| 6 | Kiểm thử toàn diện, bảo mật, PWA offline, tài liệu | ⬜ |

Kế hoạch đầy đủ: [`docs/PLAN.md`](docs/PLAN.md) · Tiến độ & bằng chứng: [`docs/PROGRESS.md`](docs/PROGRESS.md).

---

## Khởi chạy nhanh

### Cách A — Docker Compose (khuyến nghị)

```bash
cp .env.example .env          # điền secret thật nếu triển khai ngoài local
docker compose up -d --build
```

- Web: <http://localhost:3000>
- API + Swagger: <http://localhost:4000/api/docs>
- MailHog (email demo): <http://localhost:8025>

Container `api` tự chạy migration, seed nền tảng và 30 ngày lịch sử vận hành (đặt phòng, POS, night audit) trong lần khởi động đầu.

### Cách B — Local (không cần Docker)

```bash
pnpm setup      # tạo .env.local, khởi động PostgreSQL 16 + Redis cục bộ, migrate, seed
pnpm dev        # API :4000 · Web :3000
```

Yêu cầu: Node.js ≥ 22, pnpm 11, PostgreSQL 16 + Redis (script `scripts/dev-db.sh` tự quản lý cluster trong `.dev/`, không ảnh hưởng dữ liệu hệ thống).

Kiểm tra nghiệm thu Giai đoạn 1–2:

```bash
bash scripts/check-acceptance.sh
```

---

## Năng lực Giai đoạn 2

- **Đặt phòng & chống overbooking**: Redis lock → PostgreSQL advisory lock → kiểm tra trong transaction → `EXCLUDE USING gist` trên khoảng ngày. Bài test 10 request đồng thời cho phòng cuối chỉ cho đúng 1 thành công.
- **Lễ tân**: bàn đến/đi/đang ở, nhận & trả phòng, folio, ghi phí, thanh toán đa phương thức, xuất hoá đơn GTGT in được.
- **POS & KDS**: sơ đồ bàn, menu theo outlet, gửi bếp/bar, ghi nợ phòng, thanh toán, màn hình bếp realtime.
- **Night Audit**: kết chuyển doanh thu phòng theo từng đêm, hạch toán hoa hồng OTA, khoá ngày nghiệp vụ, đối soát Nợ/Có và doanh thu bộ phận/kênh.
- **Sổ nhật ký kép**: mọi khoản phí và thanh toán đều sinh bút toán cân bằng; dashboard đọc trực tiếp từ sổ.
- **Buồng phòng**: bảng công việc tối ưu điện thoại, checklist, đổi trạng thái phòng, báo hỏng.
- **Tape chart**: 14 ngày, kéo thanh đặt phòng sang phòng khác để đổi phòng.

![Bàn lễ tân](docs/evidence/front-desk-1920.png)

![POS & sơ đồ bàn](docs/evidence/pos-1920.png)

![Night Audit](docs/evidence/night-audit-1920.png)

---

## Năng lực Giai đoạn 3

- **Channel Manager thật**: 8 adapter OTA (Booking.com, Agoda, Expedia, Airbnb, Traveloka, Trip.com, Google Hotel Ads, Tripadvisor) + 9 adapter social (Facebook, Instagram, Zalo, TikTok, WhatsApp, Telegram, LINE, KakaoTalk, WeChat) sau một interface duy nhất.
- **ARI 2 chiều**: đẩy tồn phòng & giá theo ngày vào hàng đợi idempotent; worker retry với exponential backoff, ghi sync log và chuyển **DLQ** khi hết lượt; đẩy lại job lỗi bằng một nút.
- **Kéo booking & webhook**: connector sinh booking thật vào PMS; webhook ký HMAC-SHA256, chống replay nhờ `(channelId, externalId)` unique — gửi lặp chỉ trả về booking cũ.
- **Booking engine công khai** tại `/book`: tìm phòng trống theo ngày, chọn hạng phòng, nhập thông tin khách, xác nhận tức thì và nhận mã đặt phòng.
- **Social Commerce Inbox**: 9 kênh chat trong một hộp thư, gán trạng thái, trả lời khách qua adapter, lưu toàn bộ lịch sử.
- **Attribution**: dashboard hiển thị doanh thu **net sau hoa hồng** và số booking theo từng kênh; mọi con số lấy từ sổ cái.

![Channel Manager](docs/evidence/channels-1920.png)

![Social Inbox](docs/evidence/inbox-1920.png)

![Booking Engine](docs/evidence/booking-engine-1920.png)

---

## Tài khoản demo

Mật khẩu chung: **`GrandSuite@2026`** (đổi qua `SEED_ADMIN_PASSWORD` trước khi seed).

| Email | Vai trò | Phạm vi |
|---|---|---|
| `chairman@grandsuite.vn` | Chủ tịch | Toàn tập đoàn |
| `ceo@grandsuite.vn` | Tổng giám đốc | Toàn tập đoàn |
| `cfo@grandsuite.vn` | Kế toán trưởng | Toàn tập đoàn |
| `revenue@grandsuite.vn` | Giám đốc doanh thu | Toàn tập đoàn |
| `hr@grandsuite.vn` | Quản lý nhân sự | Toàn tập đoàn |
| `marketing@grandsuite.vn` | Marketing & Sales | Toàn tập đoàn |
| `manager.han@grandsuite.vn` | Giám đốc khách sạn | Grand Suite Hà Nội |
| `manager.dan@grandsuite.vn` | Giám đốc nhà hàng | Le Jardin Đà Nẵng |
| `frontdesk@grandsuite.vn` | Lễ tân | Grand Suite Hà Nội |
| `housekeeping@grandsuite.vn` | Buồng phòng | Grand Suite Hà Nội |
| `chef@grandsuite.vn` | Bếp trưởng | Grand Suite Hà Nội |
| `fnb@grandsuite.vn` | Quản lý nhà hàng | Grand Suite Hà Nội |
| `cashier@grandsuite.vn` | Thu ngân | Grand Suite Hà Nội |
| `warehouse@grandsuite.vn` | Quản lý kho | Grand Suite Hà Nội |
| `admin@grandsuite.vn` | Quản trị hệ thống | Toàn tập đoàn |

---

## Kiến trúc

```
Next.js 15 (PWA)  ──HTTP/WS──▶  NestJS 11 modular monolith  ──▶  PostgreSQL 16
   │  App Router,                ├─ Guards: JWT → CSRF → RBAC       Redis 7
   │  RBAC-aware shell,          ├─ 14 vai trò, phạm vi cơ sở        BullMQ (job)
   │  vi/en, dark mode           ├─ Audit hash chain (bất biến)
   └─ Cmd+K, responsive          └─ Outbox + adapter integrations
```

- **Sổ nhật ký kép là nguồn sự thật tài chính** (Giai đoạn 2): dashboard, P&L và báo cáo kênh đều tổng hợp từ bút toán, nên đối soát đúng theo cấu trúc.
- **Chống overbooking 3 lớp**: Redis lock → kiểm tra trong transaction → PostgreSQL exclusion constraint.
- **Bảo mật**: Argon2id, JWT 15' + refresh xoay vòng (phát hiện tái sử dụng), TOTP 2FA + mã khôi phục, CSRF double-submit, rate limit, Helmet, mã hoá AES-256-GCM cho trường nhạy cảm, audit bất biến.
- **Tích hợp**: mọi kênh/thanh toán/hoá đơn đi qua adapter; mặc định chạy mock/sandbox, cắm API key thật trong màn hình Tích hợp.

Chi tiết quyết định kiến trúc và ERD 147 model: [`docs/PLAN.md`](docs/PLAN.md).

---

## Cấu trúc

```
apps/api        NestJS — auth, IAM, cấu hình, audit, dashboard, realtime
apps/web        Next.js — design system 5 sao, shell theo vai trò, quản trị
packages/shared Tiền tệ, thuế, ngày nghiệp vụ, RBAC, zod schema, i18n (unit test)
packages/config Tailwind preset / design tokens
docker/         Dockerfiles + entrypoint
scripts/        setup, dev, dev-db, kiểm tra nghiệm thu
docs/           PLAN, PROGRESS, ảnh chụp giao diện
```

---

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `pnpm dev` | Chạy API + Web (local) |
| `pnpm build` | Build toàn bộ monorepo |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript strict |
| `pnpm test` | Unit (shared) + integration (API, DB thật) |
| `pnpm test:coverage` | Coverage logic lõi |
| `pnpm db:start` / `db:stop` | PostgreSQL + Redis cục bộ |
| `pnpm db:migrate` / `db:seed` | Migration / dữ liệu demo |
| `pnpm db:seed:history` | Sinh lại 30 ngày lịch sử vận hành |
| `pnpm db:reset` | Xoá & dựng lại dữ liệu demo |
| `bash scripts/check-acceptance.sh` | Kiểm tra Gate hiện tại |

---

## Kiểm thử

- **78 unit test** cho tiền tệ, thuế (VAT + phí dịch vụ ++/inclusive), ngày nghiệp vụ, RBAC, định giá lưu trú, bút toán kép, zod schema.
- **23 integration test** trên PostgreSQL thật: 15 vai trò, CSRF, chéo cơ sở, audit chain, luồng khách hoàn chỉnh, 10 request đồng thời, webhook idempotent + chữ ký, ARI retry/DLQ, booking engine công khai, inbox trả lời.
- `bash scripts/check-acceptance.sh` chạy **28 kiểm tra** Gate 1–3.
- Ảnh chụp 1920 / 768 / 390 px (25 ảnh màn hình): [`docs/evidence/`](docs/evidence/).

---

## Ghi chú triển khai

- Biến môi trường bắt buộc được kiểm tra bằng zod; API **không khởi động** nếu thiếu/ yếu secret.
- `.env.local` được tạo với secret ngẫu nhiên và quyền `600`, không commit.
- Backup: service `backup` trong compose chạy `pg_dump` hằng ngày, giữ 7 ngày (cấu hình qua `BACKUP_RETENTION_DAYS`).
- Production: thay toàn bộ secret mặc định, bật HTTPS, cấu hình `ALLOWED_ORIGINS`, dùng object storage cho chứng từ.

© 2026 Grand Suite Group — dữ liệu trong repo là dữ liệu demo, không phải khách hàng thật.
