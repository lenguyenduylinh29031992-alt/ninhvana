# GRAND SUITE — Tiến độ triển khai

> Cập nhật sau mỗi giai đoạn. Nguồn: `docs/PLAN.md`. Ngày: 2026-10-25.

## Trạng thái tổng quan

| Giai đoạn | Nội dung | Trạng thái | Gate |
|---|---|---|---|
| 0 | Kế hoạch: giả định, kiến trúc, ERD, backlog | ✅ Hoàn tất | PLAN.md được duyệt |
| 1 | Nền tảng: monorepo, DB, auth, RBAC, design system | ⏳ Đang thực hiện | build+lint+test xanh, 13 vai trò đăng nhập |
| 2 | Lõi PMS + POS + Revenue + Night Audit | ⬜ Chưa | luồng trọn vẹn + đối soát |
| 3 | Kênh bán, booking engine, social inbox, attribution | ⬜ Chưa | ≥5 kênh → dashboard |
| 4 | Chi phí, mua hàng, kho, HRM, lương, P&L | ⬜ Chưa | P&L/GOP/GOPPAR đúng |
| 5 | Dashboard điều hành, report builder, AI, dự báo | ⬜ Chưa | <2s, số liệu khớp 3 chiều |
| 6 | Kiểm thử, bảo mật, hiệu năng, tài liệu | ⬜ Chưa | 8/8 tiêu chí |

## Giai đoạn 0 — Đã hoàn thành

- Phân tích 10 module bắt buộc + 4 nâng cao, chốt 20 giả định nghiệp vụ (thuế, hoa hồng, lương, làm tròn, offline…).
- Kiến trúc modular monolith (NestJS) + Next.js PWA, event bus + outbox, queue 2 driver, adapter cho mọi tích hợp.
- ERD 8 miền, **147 model**, 10 ràng buộc SQL đặc biệt (trong đó exclusion constraint chống overbooking).
- Thiết kế **GL là nguồn sự thật tài chính** → đối soát dashboard/bộ phận/kênh/sổ đúng theo cấu trúc.
- Ma trận RBAC 14 vai trò, hạn mức phê duyệt, quy tắc audit bắt buộc lý do.
- Backlog 62 hạng mục theo 7 giai đoạn, ánh xạ 8 tiêu chí nghiệm thu → bằng chứng tự động.
- Môi trường: phát hiện máy không có Docker → bổ sung đường chạy local (PostgreSQL 16.15 + Redis 8.10.2 đã cài qua Homebrew), vẫn giữ chuẩn Docker Compose cho CI/khách hàng.
- Rủi ro & giảm thiểu, ADR 01–08.

## Giai đoạn 1 — Kế hoạch chi tiết (đang làm)

- [ ] F1-01 Monorepo pnpm + Turborepo + strict TS + lint
- [ ] F1-02 Docker Compose + Dockerfiles + backup service
- [ ] F1-03 Script dev-db local (`.dev/pgdata`, port 55432; redis 56379)
- [ ] F1-04 Prisma nền tảng + migration + constraint C7 + client
- [ ] F1-05 Auth (JWT cookie, refresh rotation, 2FA TOTP, argon2, CSRF)
- [ ] F1-06 RBAC + property scope + seed quyền
- [ ] F1-07 Audit hash chain + API đọc
- [ ] F1-08 Design system + app shell responsive
- [ ] F1-09 i18n + format + theme + Cmd+K + toast/skeleton
- [ ] F1-10 Seed nền (2 property, 13 users, 262 phòng, 8 outlet, COA)
- [ ] F1-11 Health/logging/problem+json/helmet/rate limit
- [ ] F1-12 CI GitHub Actions

## Số liệu kiểm thử

| Thời điểm | Unit | Integration | E2E | Coverage lõi |
|---|---|---|---|---|
| G0 | – | – | – | – |

## Rủi ro đang mở

1. Không có Docker trên máy phát triển → tiêu chí 1 được chứng minh bằng compose + script kiểm tra, hệ thống chạy thật trên PG/Redis local.
2. Khối lượng 147 model rất lớn → ưu tiên P0 theo ma trận nghiệm thu; module P1/P2 vẫn có API + UI thật, workflow gọn hơn.
3. Phiên bản thư viện 2026 có thể lệch API đã biết → pin major, smoke test ngay khi cài.

## Nhật ký quyết định

- 2026-10-25: Chốt dùng PWA thay React Native (ADR-01).
- 2026-10-25: Chốt GL là nguồn sự thật duy nhất, snapshot chỉ là cache (ADR-02).
- 2026-10-25: Chốt exclusion constraint PostgreSQL là chốt chặn overbooking cuối (ADR-03).
