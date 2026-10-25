# GRAND SUITE — Tiến độ triển khai

> Cập nhật sau mỗi giai đoạn. Nguồn kế hoạch: `docs/PLAN.md`. Ngày: 2026-10-25.

## Trạng thái tổng quan

| Giai đoạn | Nội dung | Trạng thái | Gate |
|---|---|---|---|
| 0 | Kế hoạch: giả định, kiến trúc, ERD, backlog | ✅ Hoàn tất | PLAN.md |
| 1 | Nền tảng: monorepo, DB, auth, RBAC, audit, design system, seed | ✅ Hoàn tất | **Gate 1 — PASS** |
| 2 | Lõi PMS + POS + Revenue + Night Audit | ⏳ Tiếp theo | luồng trọn vẹn + đối soát |
| 3 | Kênh bán, booking engine, social inbox, attribution | ⬜ Chưa | ≥5 kênh → dashboard |
| 4 | Chi phí, mua hàng, kho, HRM, lương, P&L | ⬜ Chưa | P&L/GOP/GOPPAR đúng |
| 5 | Dashboard điều hành đầy đủ, report builder, AI, dự báo | ⬜ Chưa | <2s, số liệu khớp 3 chiều |
| 6 | Kiểm thử, bảo mật, hiệu năng, tài liệu | ⬜ Chưa | 8/8 tiêu chí |

---

## Giai đoạn 1 — Hoàn tất

### Đã xây dựng

**Nền tảng & hạ tầng**
- Monorepo pnpm 11 + Turborepo + TypeScript strict, ESLint flat config, Prettier.
- PostgreSQL 16.15 + Redis 8.10.2 chạy cục bộ qua `scripts/dev-db.sh` (không cần Docker); Docker Compose 6 service (db, redis, api, web, mailhog, backup) + Dockerfile đa tầng.
- CI GitHub Actions: install → prisma generate/migrate/seed → lint → typecheck → test → coverage → build.

**Cơ sở dữ liệu (3 migration)**
- 31 model nền tảng: Organization, Property, User, Role/Permission, UserPropertyRole, RefreshToken, AuditLog, SystemSetting, NumberSequence, Currency, ExchangeRate, TaxRate, DocumentTemplate, IntegrationConfig, ApiKey, WebhookSubscription, DomainEvent, Notification, Alert, GlAccount, Department, Floor, RoomType, Amenity, Room, RoomStatusLog, RatePlan, RatePlanRate, Outlet.
- Ràng buộc SQL: audit append-only trigger, unique role gán cấp tập đoàn, check số tiền không âm.
- Seed 1.9 giây: 2 cơ sở, 250 phòng/12 hạng, 44 tài khoản USALI↔TT200, 8 gói giá × 35.136 dòng giá ngày, 3.655 tỷ giá, 7 biểu thuế, 6 tiền tệ, 8 outlet, 28 cấu hình tích hợp, 15 tài khoản demo.

**Xác thực & phân quyền**
- JWT access 15' (httpOnly cookie) + refresh 30 ngày xoay vòng, phát hiện tái sử dụng → thu hồi toàn bộ phiên.
- Argon2id, khoá tài khoản sau 5 lần sai (15 phút), TOTP 2FA + 8 mã khôi phục dùng một lần, chống replay theo time-step.
- CSRF double-submit + kiểm tra Origin; Bearer client được miễn (không dùng credential ambient).
- RBAC 14 vai trò × 88 quyền, phạm vi tập đoàn/cơ sở; chặn gán vai trò cao hơn quyền người thao tác; audit mọi thay đổi.
- Rate limit: 300 req/phút chung, 10 req/phút cho đăng nhập.

**Audit & bảo mật dữ liệu**
- Audit log append-only (trigger chặn UPDATE/DELETE), chuỗi băm SHA-256 có thể kiểm tra toàn vẹn qua API; khoá advisory chống phân nhánh.
- Mã hoá AES-256-GCM cho credential tích hợp; không trả secret qua API; PII bị redact trong log.
- Helmet, problem+json thống nhất, request-id xuyên suốt, cấu hình env fail-fast.

**Giao diện (design system “ivory & champagne”)**
- Token sáng/tối, serif Cormorant Garamond cho tiêu đề, Inter cho dữ liệu; 20 primitive a11y (Radix).
- App shell responsive: sidebar theo quyền, topbar, chọn cơ sở, Cmd+K, thông báo, dark mode, i18n vi/en.
- Màn hình: đăng nhập (2FA), trung tâm điều hành, người dùng, vai trò & quyền, nhật ký kiểm toán, cấu hình (thuế/tỷ giá/tiền tệ/mẫu in), tích hợp, hồ sơ & 2FA.
- WebSocket realtime: ticket ngắn hạn, phòng theo cơ sở/tổ chức, tự động làm mới dữ liệu khi có sự kiện.

### Bằng chứng Gate 1

| Hạng mục | Kết quả |
|---|---|
| `pnpm lint` | ✅ 0 lỗi, 0 cảnh báo |
| `pnpm typecheck` | ✅ API + Web + Shared |
| Unit test shared | ✅ **63/63** |
| Integration API (PostgreSQL thật) | ✅ **7/7** — 15 vai trò đăng nhập, CSRF, chéo cơ sở, audit chain |
| `pnpm build` | ✅ Next.js 15.5 (11 route) + NestJS |
| Đăng nhập demo | ✅ 15/15 tài khoản, đúng phạm vi cơ sở |
| Audit chain | ✅ `{valid:true}` sau hàng chục sự kiện |
| Responsive | ✅ 1920 / 768 / 390 px — ảnh tại `docs/evidence/` |
| Docker Compose | ⚠️ Viết đầy đủ nhưng **chưa chạy được trên máy này** (không có Docker); CI dùng service container để bù |

### Khác biệt so với kế hoạch (có chủ đích)

- Prisma schema đặt tại `apps/api/prisma` thay vì `packages/db` để tránh rủi ro phân giải client trong pnpm workspace; seed là module riêng trong `apps/api/prisma/seed.ts`.
- UI primitives nằm trong `apps/web/src/components/ui` (chuẩn shadcn) thay vì `packages/ui`, giảm một tầng build.
- Chưa dùng BullMQ ở Giai đoạn 1 (chưa có job nền); Redis đã sẵn sàng cho khoá/queue từ Giai đoạn 2.

---

## Giai đoạn 2 — Kế hoạch kế tiếp

1. Schema lưu trú: Guest, Reservation, ReservationRoom/Night, Folio, FolioItem, Payment, Invoice, NightAudit, HousekeepingTask + exclusion constraint chống overbooking.
2. Booking + availability + quote server-side; Redis lock + test 20 request đồng thời.
3. Tape chart kéo-thả; check-in/out; folio; thanh toán đa phương thức (adapter VNPay/MoMo/ZaloPay/Stripe + VietQR).
4. POS: outlet, menu, bàn, order, KDS, charge-to-room; recipe costing.
5. Revenue posting engine + GL bút toán kép + Night Audit + đối soát.
6. Gate 2: luồng trọn vẹn booking → check-in → POS → folio → checkout → hoá đơn → night audit → P&L; đối soát = 0; test đồng thời.

## Rủi ro đang mở

1. **Không có Docker trên máy phát triển** → compose chưa được chạy thực tế; CI sẽ là nơi xác minh. Cần chạy `docker compose up` trên máy có Docker trước khi bàn giao.
2. Khối lượng Giai đoạn 2 lớn (reservation + POS + GL + night audit) → ưu tiên P0 theo ma trận nghiệm thu, làm theo nhánh dọc trước khi mở rộng.
3. Giao diện mới có 11 route; khi thêm 15+ route cần kiểm soát bundle size (dynamic import cho màn hình nặng như tape chart, POS).
4. Chưa có Playwright e2e chính thức (ảnh chụp dùng Playwright thủ công) — sẽ bổ sung ở Giai đoạn 6, sau khi luồng nghiệp vụ ổn định.

## Nhật ký quyết định

- 2026-10-25: PWA thay React Native (ADR-01).
- 2026-10-25: GL là nguồn sự thật duy nhất (ADR-02).
- 2026-10-25: Exclusion constraint PostgreSQL là chốt chặn overbooking cuối (ADR-03).
- 2026-10-25: Audit hash dùng JSON sắp xếp khoá (do `jsonb` không giữ thứ tự khoá) — đã sửa sau khi test phát hiện chuỗi đứt.
- 2026-10-25: RequestContext dùng `AsyncLocalStorage` thật thay vì biến toàn cục (đã sửa sau khi thấy `ip`/`requestId` rỗng).
