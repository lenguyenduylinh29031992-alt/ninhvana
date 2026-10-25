# GRAND SUITE — Tiến độ triển khai

> Cập nhật sau mỗi giai đoạn. Nguồn kế hoạch: `docs/PLAN.md`. Ngày: 2026-10-25.

## Trạng thái tổng quan

| Giai đoạn | Nội dung | Trạng thái | Gate |
|---|---|---|---|
| 0 | Kế hoạch: giả định, kiến trúc, ERD, backlog | ✅ Hoàn tất | PLAN.md |
| 1 | Nền tảng: monorepo, DB, auth, RBAC, audit, design system, seed | ✅ Hoàn tất | **Gate 1 — PASS** |
| 2 | Lõi PMS + POS + Revenue + Night Audit + sổ cái | ✅ Hoàn tất | **Gate 2 — PASS** |
| 3 | Kênh bán, booking engine, social inbox, attribution | ⏳ Tiếp theo | ≥5 kênh → dashboard |
| 4 | Chi phí, mua hàng, kho, HRM, lương, P&L | ⬜ Chưa | P&L/GOP/GOPPAR đúng |
| 5 | Dashboard đầy đủ, report builder, AI, dự báo, seed 24 tháng | ⬜ Chưa | <2s, số liệu khớp 3 chiều |
| 6 | Kiểm thử, bảo mật, hiệu năng, tài liệu, PWA offline | ⬜ Chưa | 8/8 tiêu chí |

---

## Giai đoạn 1 — Hoàn tất (tóm tắt)

- Monorepo pnpm 11 + Turborepo; NestJS 11 + Next.js 15 + Prisma 6/PostgreSQL 16 + Redis.
- 14 vai trò × 88 quyền, phạm vi cơ sở, JWT + refresh xoay vòng, 2FA TOTP, CSRF, rate limit.
- Audit log append-only với chuỗi băm SHA-256; AES-256-GCM cho credential tích hợp.
- Design system “ivory & champagne”, dark mode, Cmd+K, i18n vi/en; 3 migration nền tảng; seed 2 cơ sở, 250 phòng.
- Gate 1: 63 unit + 7 integration test, 19 kiểm tra nghiệm thu, ảnh 1920/768/390.

---

## Giai đoạn 2 — Hoàn tất: vận hành khách sạn & nhà hàng

### Mô hình dữ liệu (2 migration mới)

- **29 model vận hành**: Guest, GuestDocument, GuestPreference, Company, Channel, Reservation, ReservationRoom, ReservationNight, Allotment, Folio, FolioItem, Payment, Refund, Invoice, InvoiceLine, NightAudit, CashSession, HousekeepingTask, MaintenanceTicket, LostAndFound, ServiceRequest, TableArea, PosTable, TableReservation, MenuCategory, MenuItem, ModifierGroup, Modifier, PosOrder, PosOrderItem, KdsTicket, PosPayment, JournalEntry, JournalLine.
- **Chống overbooking ở tầng DB**: `EXCLUDE USING gist (roomId WITH =, daterange(checkIn, checkOut) WITH &&)` cho các stay `RESERVED/IN_HOUSE` (cần `btree_gist`), kèm check `checkOut > checkIn`.
- **Ràng buộc sổ cái**: mỗi dòng chỉ Nợ hoặc Có, không âm; mỗi entry lưu tổng Nợ/Có.
- **Đánh số chứng từ**: `UPDATE … RETURNING` nguyên tử trong transaction, không trùng khi chạy song song.

### Nghiệp vụ đã chạy thật

1. **Đặt phòng**: kiểm tra tồn theo hạng phòng/ngày, định giá từng đêm (BAR/rate plan), cộng phí dịch vụ 5% và VAT 8%, hoa hồng kênh, gán phòng cụ thể, tạo folio và ReservationNight.
2. **Chống overbooking 3 lớp**: Redis SET NX (nếu có) → PostgreSQL advisory lock trong transaction → availability recount + exclusion constraint; retry khi serialization conflict.
3. **Lễ tân**: board đến/ở/đi, check-in/check-out, đổi phòng (tape chart kéo-thả), ghi phí folio, huỷ dòng kèm bút toán đảo, thanh toán tiền mặt/thẻ/chuyển khoản/VietQR/công nợ.
4. **POS**: mở order theo bàn hoặc mang đi, menu theo outlet, thuế/phí dịch vụ, gửi bếp (KDS ticket), ghi nợ phòng, thanh toán, huỷ order.
5. **Night Audit**: kết chuyển đêm phòng chưa hạch toán cho đúng ngày nghiệp vụ, post doanh thu theo bộ phận/kênh, accrual hoa hồng OTA, tính occupancy/ADR/RevPAR/doanh thu/tiền thu, chặn chạy lại ngày đã khoá.
6. **Sổ cái kép**: mọi khoản phí (Dr AR/Cr doanh thu + VAT + phí dịch vụ), thanh toán (Dr tiền/Cr AR), hoa hồng (Dr 6210/Cr 3310); mọi bút toán được kiểm tra cân bằng trước khi ghi.
7. **Hoá đơn**: sinh số, dòng hàng, thuế, trạng thái PAID/ISSUED, e-invoice mock VNPT, trang in HTML chuẩn A4.
8. **Buồng phòng**: task tự sinh khi checkout, checklist, cập nhật trạng thái phòng, báo hỏng.
9. **Đối soát**: API trả doanh thu theo bộ phận, theo kênh, tổng sổ, tiền thu, folio và 4 check tự động.

### UI mới (8 màn hình)

- `/front-desk` — bàn lễ tân, đặt phòng, chi tiết folio, thanh toán, hoá đơn.
- `/pos` — sơ đồ bàn + order + ghi nợ phòng/thanh toán; `/pos/kds` — màn hình bếp 3 cột.
- `/night-audit` — chạy khoá sổ, KPI, đối soát, ngoại lệ, lịch sử.
- `/housekeeping` — bảng công việc mobile-first.
- `/tape-chart` — 14 ngày, kéo đổi phòng.
- `/reservations`, `/guests` — danh sách & hồ sơ.
- Dashboard viết lại: KPI thật từ sổ cái, sparkline 14 ngày, doanh thu bộ phận/kênh, công suất/ADR/RevPAR/TRevPAR/ALOS, việc cần xử lý, sức khoẻ hệ thống, hoạt động gần đây.

### Seed & dữ liệu demo

- `prisma/seed-operations.ts`: 25 kênh bán, 8 công ty, 180 khách, 60 món menu, 60 bàn.
- `prisma/seed-history.ts`: **30 ngày** lịch sử có sổ cái — 3.638 lượt khách, 7.251 đêm phòng, 2.457 order POS, night audit cho từng ngày, 120 khách đang lưu trú + 40 dự kiến trả phòng + 20 khách đến hôm nay.
- Chạy lại: `pnpm db:seed:history` (thêm `SEED_HISTORY_FORCE=1` để rebuild). Idempotent, chỉ xoá dữ liệu tiền tố `hist-`.

### Bằng chứng Gate 2

| Hạng mục | Kết quả |
|---|---|
| `pnpm lint` | ✅ 0 lỗi, 0 cảnh báo |
| `pnpm typecheck` | ✅ API + Web + Shared |
| Unit test shared | ✅ **78/78** (thêm định giá stay, bút toán kép, hoa hồng, chính sách huỷ) |
| Integration API | ✅ **15/15** — bao gồm luồng đầy đủ và 10 request đồng thời |
| Chống overbooking | ✅ 10 request → 1 thành công, 9 × 409, DB đúng 1 stay |
| Luồng trọn vẹn | ✅ booking → check-in → POS ghi nợ → night audit → checkout → thanh toán → hoá đơn PAID |
| Đối soát | ✅ Doanh thu = bộ phận = kênh = sổ cái; Nợ = Có; chênh lệch 0 ₫ |
| Night audit | ✅ Chạy lại ngày đã khoá → 409; lịch sử 14 ngày trong UI |
| Acceptance script | ✅ **25/25** kiểm tra |
| Responsive | ✅ 1920 / 768 / 390; ảnh mới tại `docs/evidence/` |
| Audit chain | ✅ Hợp lệ sau toàn bộ giao dịch test |

### Sai lệch / giới hạn có chủ ý

- Lịch sử seed hiện **30 ngày** (chưa phải 24 tháng). Phase 5 sẽ mở rộng bằng cùng generator; hiện đủ cho dashboard, night audit và đối soát.
- POS chưa trừ kho nguyên liệu (recipe costing) — phụ thuộc module kho Phase 4.
- Refund có API + bút toán đảo nhưng chưa có màn hình riêng; hoàn tiền đang thao tác qua API.
- Tape chart hỗ trợ kéo đổi **phòng**, chưa kéo đổi ngày (cần định giá lại).
- Hoá đơn điện tử là adapter mock VNPT; cắm credential thật ở Phase 6.
- Ảnh hưởng của múi giờ: đã pin session PostgreSQL về UTC để `@db.Date` so sánh đúng; đây là bài học quan trọng cho báo cáo tài chính.

---

## Giai đoạn 3 — Kế hoạch kế tiếp

1. **Channel Manager**: model ChannelMapping/ARIQueue/SyncLog; adapter interface `pullReservations/pushAvailability/pushRates/handleWebhook/mapStatus`; mock connectors cho Booking/Agoda/Expedia/Airbnb/Traveloka/Trip.com; retry + exponential backoff + DLQ + màn hình sync log.
2. **Booking Engine**: tìm phòng, giữ chỗ 15 phút, thanh toán cọc, xác nhận tự động, mã giảm giá.
3. **Social Commerce Inbox**: Facebook/Instagram/Zalo/WhatsApp/TikTok/Telegram/LINE/KakaoTalk/WeChat adapter; hội thoại đa kênh, gán nhân viên, chuyển thành booking.
4. **Attribution**: UTM/click id, commission, net revenue theo kênh; idempotency webhook; 5+ kênh mock trong seed để chứng minh dashboard theo kênh.
5. Gate 3: ≥5 kênh tạo booking hiển thị trên dashboard; ARI 2 chiều có retry/DLQ; không trùng booking khi webhook lặp.

## Rủi ro đang mở

1. **Docker chưa chạy được trên máy này** — compose đã cập nhật entrypoint seed history nhưng cần kiểm chứng trên máy có Docker.
2. **Lịch sử 30 ngày** — báo cáo MoM/YoY cần 24 tháng; ưu tiên Phase 5 trước khi demo tài chính dài hạn.
3. **Đối soát folio**: doanh thu POS trả trực tiếp không đi qua folio, nên check “folio ≤ sổ” (không phải bằng). Các báo cáo tài chính phải dùng sổ cái, không dùng folio.
4. **Khối lượng Phase 3** lớn (10 kênh + booking engine + inbox) — sẽ làm adapter framework trước, mock connectors sau, real key để Phase 6.

## Nhật ký quyết định

- 2026-10-25: PWA thay React Native (ADR-01); GL là nguồn sự thật duy nhất (ADR-02); exclusion constraint là chốt chặn overbooking (ADR-03).
- 2026-10-25: Audit hash dùng JSON sắp xếp khoá; RequestContext dùng `AsyncLocalStorage`.
- 2026-10-25: Sổ cái ghi ngay khi phát sinh (POS/thanh toán) hoặc khi night audit/checkout (đêm phòng) để dashboard luôn sống.
- 2026-10-25: Pin PostgreSQL session timezone UTC — sửa lỗi lệch ngày do `@db.Date` so sánh như timestamp.
