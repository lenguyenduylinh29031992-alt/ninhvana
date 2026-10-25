# GRAND SUITE — Tiến độ triển khai

> Cập nhật sau mỗi giai đoạn. Nguồn kế hoạch: `docs/PLAN.md`. Ngày: 2026-10-25.

## Trạng thái tổng quan

| Giai đoạn | Nội dung | Trạng thái | Gate |
|---|---|---|---|
| 0 | Kế hoạch: giả định, kiến trúc, ERD, backlog | ✅ Hoàn tất | PLAN.md |
| 1 | Nền tảng: monorepo, DB, auth, RBAC, audit, design system, seed | ✅ Hoàn tất | **Gate 1 — PASS** |
| 2 | Lõi PMS + POS + Revenue + Night Audit + sổ cái | ✅ Hoàn tất | **Gate 2 — PASS** |
| 3 | Kênh bán, booking engine, social inbox, attribution | ✅ Hoàn tất | **Gate 3 — PASS** |
| 4 | Chi phí, mua hàng, kho, HRM, lương, P&L | ⏳ Tiếp theo | P&L/GOP/GOPPAR đúng |
| 5 | Dashboard đầy đủ, report builder, AI, dự báo, seed 24 tháng | ⬜ Chưa | <2s, số liệu khớp 3 chiều |
| 6 | Kiểm thử, bảo mật, hiệu năng, tài liệu, PWA offline | ⬜ Chưa | 8/8 tiêu chí |

---

## Giai đoạn 1 — Nền tảng (hoàn tất)

Monorepo pnpm 11 + Turborepo; NestJS 11 + Next.js 15 + Prisma/PostgreSQL 16 + Redis. 14 vai trò × 88 quyền, phạm vi cơ sở, JWT/refresh, 2FA TOTP, CSRF, rate limit, audit chain SHA-256, mã hoá credential AES-256-GCM, design system “ivory & champagne”, i18n vi/en, 2 cơ sở 250 phòng. Gate 1: 63 unit + 7 integration test, 19 kiểm tra nghiệm thu.

## Giai đoạn 2 — PMS, POS, Night Audit (hoàn tất)

- 29 model vận hành; chống overbooking 3 lớp, chốt bằng `EXCLUDE USING gist` trên khoảng ngày.
- Đặt phòng → check-in → POS ghi nợ phòng → night audit → checkout → thanh toán → hoá đơn PAID.
- Sổ cái kép là nguồn sự thật; đối soát doanh thu = bộ phận = kênh = sổ; 10 request đồng thời chỉ 1 thành công.
- UI lễ tân, POS, KDS, buồng phòng, tape chart, night audit, khách, đặt phòng; dashboard đọc từ sổ.
- Seed 30 ngày: 3.638 lượt khách, 7.251 đêm phòng, 2.457 order POS.
- Gate 2: 78 unit + 15 integration test, 25 kiểm tra nghiệm thu.

---

## Giai đoạn 3 — Kênh bán, Booking Engine, Social Inbox (hoàn tất)

### Mô hình dữ liệu (1 migration mới)

- `ChannelRoomMapping`: map hạng phòng nội bộ ↔ mã phòng/rate plan của kênh.
- `ChannelSyncJob`: hàng đợi ARI idempotent (`channelId + idempotencyKey`), attempts, `nextAttemptAt`, DLQ.
- `ChannelSyncLog`: nhật ký PUSH/PULL/WEBHOOK, request/response, lỗi, thời lượng.
- `ExternalReservation`: unique `(channelId, externalId)` — chống tạo trùng khi webhook replay.
- `Conversation` / `ConversationMessage`: hội thoại đa kênh, tin nhắn vào/ra, trạng thái, unread.

### Adapter & đồng bộ

- Interface `ChannelAdapter` gồm `pullReservations`, `pushAvailability`, `pushRates`, `handleWebhook`, `mapStatus`, `sendMessage`.
- **17 connector mock** chạy thật qua cùng interface: 8 OTA + 9 social. Thay bằng connector thật chỉ cần thay class, không đổi nghiệp vụ.
- ARI: tính tồn phòng từ buồng vật lý trừ booking đang giữ, lấy giá BAR, tạo job theo ngày/hạng phòng, xử lý ngay và trả thống kê.
- Retry: lỗi tạm thời → `FAILED` + backoff `60s × 2^(n-1)`; hết `maxAttempts` → `DLQ`; retry thủ công reset payload và chạy lại.
- Webhook: HMAC-SHA256 trên `provider.timestamp.body`, cửa sổ 5 phút, sai chữ ký 401; replay trả `duplicate=true`, không tạo booking thứ hai.
- Kéo booking: adapter sinh external reservation → PMS tạo reservation thật → lưu link; lỗi từng booking không làm hỏng cả lô.

### Booking engine công khai

- `GET /api/v1/public/booking/properties`, `availability`, `POST reservations` — không cần đăng nhập, rate limit 30/phút.
- Trang `/book`: tìm theo ngày/khách, hiển thị hạng phòng còn trống và tổng tiền, form khách, xác nhận tức thì mã `RSV-*`, thanh toán tại khách sạn.
- Dùng chính `ReservationsService` nên vẫn qua kiểm tra tồn phòng, khoá và exclusion constraint.

### Social inbox & attribution

- 9 hội thoại seed (Facebook, Instagram, Zalo, TikTok, WhatsApp, Telegram, LINE, KakaoTalk, WeChat), mỗi hội thoại có lịch sử tin nhắn.
- Trả lời qua adapter, lưu OUTBOUND + external id, cập nhật `lastMessageAt`, trạng thái; ghi audit.
- Dashboard bổ sung **booking theo kênh** và **doanh thu net sau hoa hồng**; channel page hiển thị mapping, booking 30 ngày, job, sync log.

### Bằng chứng Gate 3

| Hạng mục | Kết quả |
|---|---|
| `pnpm lint` · `typecheck` · `build` | ✅ 0 lỗi |
| Unit test shared | ✅ **78/78** |
| Integration API | ✅ **23/23** (thêm 8 test kênh/booking/inbox) |
| Webhook | ✅ Ký hợp lệ tạo booking; replay `duplicate=true`; sai chữ ký 401 |
| ARI | ✅ 56 job đẩy thành công; job lỗi → retry/backoff → DLQ → retry thủ công thành công |
| Kênh | ✅ 25 kênh · 8 OTA · 9 social · 112 mapping · 3.793 booking 30 ngày |
| Kéo booking | ✅ 5 OTA (Booking, Agoda, Expedia, Airbnb, Traveloka) tạo reservation thật |
| Booking engine | ✅ Public availability + tạo booking, không lộ session nội bộ |
| Inbox | ✅ 9 hội thoại, trả lời lưu lịch sử |
| Acceptance script | ✅ **28/28** |
| Audit chain | ✅ Hợp lệ sau toàn bộ traffic kênh |

### Sai lệch / giới hạn có chủ ý

- Connector là **mock** (đúng yêu cầu “mock connectors chạy thật”); OAuth/credential thật của OTA để Phase 6.
- Webhook chỉ xử lý tạo mới và ghi nhận cancel/no-show; chưa tự huỷ reservation đã tồn tại khi nhận cancel (sẽ làm cùng đối soát kênh Phase 6).
- ARI đẩy theo lô đồng bộ trong request; production sẽ chuyển sang BullMQ worker (hạ tầng Redis đã sẵn sàng).
- Social adapter chỉ gửi/nhận text; chưa đính kèm ảnh/file.
- Booking engine chưa có giữ chỗ 15 phút và thanh toán cọc online; hiện xác nhận + trả tại khách sạn.
- Kênh social hiển thị “Mapping 0” vì không bán buồng qua chat; nút kéo booking vẫn dùng để tạo booking từ hội thoại.

---

## Giai đoạn 4 — Kế hoạch kế tiếp

1. **Chi phí & mua hàng**: nhà cung cấp, yêu cầu mua → đơn → nhận hàng → hoá đơn → thanh toán; phân bổ chi phí theo bộ phận/usali; ngân sách.
2. **Kho**: nguyên liệu, recipe costing, xuất/nhập/chuyển kho, kiểm kê, định lượng món → giá vốn F&B.
3. **HRM & lương**: nhân viên, hợp đồng, chấm công, ca làm, nghỉ phép, bảng lương, thuế TNCN/BHXH, hạch toán lương.
4. **Finance**: P&L, cân đối kế toán, lưu chuyển tiền tệ, AR/AP, công nợ, USALI department costs, GOP/GOPPAR.
5. Gate 4: chi phí + lương → P&L/GOP/GOPPAR đúng; bảng cân đối cân; đối soát AR/AP; báo cáo xuất PDF/Excel.

## Rủi ro đang mở

1. **Docker chưa chạy được trên máy này** — compose/entrypoint đã cập nhật nhưng cần kiểm chứng nơi có Docker.
2. **Lịch sử 30 ngày** — Phase 5 mở rộng 24 tháng để báo cáo MoM/YoY.
3. **Webhook cancel** chưa đồng bộ hai chiều; cần hoàn thiện trước khi nối OTA thật.
4. **Khối lượng Phase 4** lớn (cost + inventory + HRM + payroll + P&L) — ưu tiên chi phí → P&L trước, HRM/payroll sau nhưng vẫn trong cùng gate.

## Nhật ký quyết định

- 2026-10-25: PWA thay React Native (ADR-01); GL là nguồn sự thật (ADR-02); exclusion constraint chặn overbooking (ADR-03).
- 2026-10-25: Pin PostgreSQL session UTC để `@db.Date` so sánh đúng.
- 2026-10-25: Kênh dùng interface adapter + idempotency key; webhook HMAC và unique external id thay vì tin tưởng payload.
- 2026-10-25: Booking engine gọi lại đúng `ReservationsService` thay vì viết đường tắt, để giữ nguyên khoá và ràng buộc DB.
