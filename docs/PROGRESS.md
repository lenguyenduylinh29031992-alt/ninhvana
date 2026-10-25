# GRAND SUITE — Tiến độ triển khai

> Cập nhật sau mỗi giai đoạn. Kế hoạch: `docs/PLAN.md`. Ngày: 2026-10-25.

## Trạng thái tổng quan

| Giai đoạn | Nội dung | Trạng thái | Gate |
|---|---|---|---|
| 0 | Kế hoạch: giả định, kiến trúc, ERD, backlog | ✅ Hoàn tất | PLAN.md |
| 1 | Nền tảng: monorepo, auth, RBAC, audit, design system | ✅ Hoàn tất | **Gate 1 — PASS** |
| 2 | PMS, Folio, POS, Night Audit, sổ cái kép | ✅ Hoàn tất | **Gate 2 — PASS** |
| 3 | Channel Manager, Booking Engine, Social Inbox, Attribution | ✅ Hoàn tất | **Gate 3 — PASS** |
| 4 | Chi phí, mua hàng, kho, HRM, lương, P&L, báo cáo tài chính | ✅ Hoàn tất | **Gate 4 — PASS** |
| 5 | Dashboard hợp nhất, 24 tháng dữ liệu, report builder, dự báo | ✅ Hoàn tất | **Gate 5 — PASS** |
| 6 | CRM, kiểm thử, bảo mật, PWA offline, đóng gói | 🟡 Code hoàn tất — chờ Docker daemon | 8/8 tiêu chí |

---

## Giai đoạn 2 — Vận hành (tóm tắt)

29 model PMS/POS; chống overbooking 3 lớp; luồng booking → check-in → POS ghi nợ → night audit → checkout → thanh toán → hoá đơn; sổ cái kép là nguồn sự thật; seed 30 ngày; Gate 2: 78 unit + 15 integration, 25 kiểm tra.

## Giai đoạn 3 — Kênh bán (tóm tắt)

17 adapter mock (8 OTA + 9 social); ARI retry/backoff/DLQ; webhook HMAC chống replay; booking engine công khai; inbox 9 kênh; net revenue theo kênh. Gate 3: 23 integration, 28 kiểm tra.

## Giai đoạn 4 — Tài chính (tóm tắt)

Mua hàng PR→PO→GRN, kho + COGS, chi phí, HRM/payroll, P&L USALI với GOP/GOPPAR, cân đối kế toán, dòng tiền, AR/AP aging; 16 bảng mới; Gate 4: 29 integration, 33 kiểm tra.

---

## Giai đoạn 5 — Dashboard, 24 tháng, Report Builder & Forecast (hoàn tất)

### Dữ liệu 24 tháng

- `seed-long-history.ts`: 730 ngày × 2 cơ sở, mỗi ngày một bút toán doanh thu phòng/F&B/đồ uống + hoa hồng OTA; mỗi tháng một bút toán chi phí cố định, tiện ích, marketing và payroll.
- Mùa vụ theo tháng (thấp 0,82 – cao 1,25), cuối tuần +16%, nhiễu xác định bằng LCG để rebuild cho cùng kết quả.
- Idempotent: xoá và tạo lại mọi entry có `sourceId` bắt đầu `long-`; chạy ~1,6 giây.
- Tổng cộng sau seed: **24 tháng** dữ liệu tài chính liên tục, bao trùm 30 ngày vận hành chi tiết.

### Dashboard hợp nhất

`GET /api/v1/dashboard/consolidated?propertyId=` trả về:

- Doanh thu, GOP, GOPPAR, RevPAR, ADR, công suất, phòng bán, AR/AP của tháng hiện tại.
- Chuỗi 24 tháng doanh thu + GOP cho biểu đồ.
- So sánh từng cơ sở: doanh thu, GOP, công suất, số phòng.
- Cơ cấu doanh thu theo kênh.
- Forecast 6 tháng kèm khoảng tin cậy và MAPE backtest.
- Cache in-memory 60 giây theo org/cơ sở; đo `tookMs` thực tế (~150 ms khi nguội).

### Dự báo

- Hồi quy tuyến tính trên 18 tháng gần nhất + hệ số mùa vụ theo tháng (giới hạn 0,65–1,45).
- **Backtest cuộn**: với 6 tháng cuối, huấn luyện trên dữ liệu trước đó rồi dự báo đúng tháng đó; MAPE hiện tại **19,7%**.
- Trả về `method`, `backtestMonths`, `mape`, 6 điểm dự báo + low/high ±16%.

### Report Builder

- 6 mẫu: P&L, hiệu quả bộ phận, doanh thu kênh (gross/commission/net/share), công suất & ADR, bảng lương, tuổi nợ AP.
- `GET /reports/templates`, `/reports/run`, `/reports/export.csv`.
- CSV UTF-8 có BOM, header tiếng Việt, mở trực tiếp bằng Excel.
- Mỗi lần chạy ghi audit `report.generated`.

### UI

- `/analytics`: KPI hợp nhất, biểu đồ 24 tháng + 6 tháng dự báo, bảng theo cơ sở, kênh, AR/AP, MAPE.
- `/reports`: chọn mẫu, ngày, chạy xem trước, tải CSV.
- `/revenue` chuyển hướng `/analytics`; menu Báo cáo đã mở.

### Bằng chứng Gate 5

| Hạng mục | Kết quả |
|---|---|
| `pnpm lint` · `typecheck` · `build` | ✅ 0 lỗi |
| Unit test shared | ✅ **78/78** |
| Integration API | ✅ **34/34** (thêm 5 test dashboard/forecast/report) |
| Dashboard | ✅ 24 tháng · doanh thu 27,65 tỷ · GOP 24,06 tỷ · GOPPAR 3,18 triệu · **146 ms** |
| Đối soát 3 chiều | ✅ Tổng công ty = tổng cơ sở; P&L = sổ cái; kênh = tổng doanh thu |
| Forecast | ✅ 6 điểm · backtest 6 tháng · **MAPE 19,7%** |
| Report Builder | ✅ 6 mẫu · P&L 7 dòng · CSV UTF-8 có header |
| Cache | ✅ Request thứ hai trả `cached=true` |
| Acceptance script | ✅ **36/36** |
| Audit chain | ✅ Hợp lệ sau khi chạy báo cáo |

### Giới hạn có chủ ý

- Dữ liệu 24 tháng là **bút toán tổng hợp theo ngày** cho tài chính/dự báo; dữ liệu vận hành chi tiết (reservation, POS) vẫn 30 ngày. Muốn occupancy lịch sử 24 tháng cần generator reservation riêng (Phase 6 nếu cần).
- Dashboard hợp nhất hiện tính P&L tháng hiện tại; bảng P&L 24 tháng đã có trong báo cáo nhưng chưa vẽ sparkline GOP.
- Cache in-memory theo process; production nên chuyển sang Redis để chia sẻ giữa instance.
- Forecast là mô hình thống kê, chưa dùng ML; chưa có scenario what-if.
- Report Builder chưa lưu mẫu tuỳ chỉnh/lịch gửi email (permission đã có).
- AR hiện 0 ₫ trong demo vì mọi hoá đơn PMS đã thanh toán; AP 458 triệu.

---

## Giai đoạn 6 — Kế hoạch kế tiếp

1. **CRM hoàn chỉnh**: hồ sơ 360°, phân hạng, điểm trung thành, voucher, chiến dịch email/SMS, đánh giá & NPS, phản hồi.
2. **Kiểm thử toàn diện**: bổ sung e2e browser cho 5 luồng, test bảo mật (OWASP), test tải dashboard/report, coverage ≥70% lõi.
3. **Bảo mật**: rà soát IDOR, rate limit endpoint công khai, CSP, secrets, dependency audit; xử lý webhook cancel hai chiều.
4. **PWA offline**: cache shell, hàng đợi thao tác POS/housekeeping, đồng bộ khi online.
5. **Vận hành**: Docker Compose chạy thật, CI đầy đủ, backup/restore diễn tập, tài liệu API/người dùng, seed 24 tháng trong entrypoint.
6. Gate 6: 8/8 tiêu chí nghiệm thu, 5 e2e flow, coverage ≥70%, không lỗ hổng nghiêm trọng, compose up + demo login.

## Rủi ro đang mở

1. Docker chưa chạy trên máy này.
2. Chi tiết vận hành chỉ 30 ngày; báo cáo occupancy dài hạn cần seed reservation.
3. AR demo bằng 0; cần hoá đơn công ty quá hạn để minh hoạ.
4. Chưa có e2e browser tự động cho 5 luồng.
5. CRM/reviews/voucher chưa triển khai.

## Nhật ký quyết định

- 2026-10-25: GL là nguồn sự thật duy nhất (ADR-02).
- 2026-10-25: Pin PostgreSQL UTC cho `@db.Date`.
- 2026-10-25: Adapter kênh + idempotency key; webhook HMAC.
- 2026-10-25: Booking engine dùng lại `ReservationsService`.
- 2026-10-25: Mọi chi phí/lương qua `PostingService`.
- 2026-10-25: Dashboard hợp nhất cache 60 giây, forecast có backtest cuộn thay vì chỉ số in-sample.
- 2026-10-25: Seed dài dùng bút toán tổng hợp theo ngày thay vì nhân bản reservation 24 tháng — giữ thời gian seed <2 giây và đủ cho báo cáo tài chính/dự báo.

---

## Giai đoạn 6 — CRM & kiểm thử (đang hoàn thiện)

### Đã hoàn thành

- **CRM**: 2 bảng mới `GuestReview`, `Campaign`; phân khúc ALL/VIP/REPEAT/LAPSED, top khách theo lifetime value; đánh giá 5 tiêu chí, phản hồi + audit; chiến dịch email theo phân khúc, gửi mock đếm người nhận. UI `/crm` 3 tab.
- **Seed CRM**: 24 đánh giá, 4 chiến dịch mẫu, idempotent.
- **Browser e2e**: `apps/web/e2e/flows.mjs` — 5/5 luồng PASS, 0 console error: dashboard KPI, dialog đặt phòng, POS mở bàn + thêm món, cập nhật buồng phòng, chạy Report Builder.
- **Test**: 78 unit shared + **37 integration API** (thêm 3 CRM) + **38 kiểm tra acceptance**.
- **Build/lint/typecheck**: xanh.

### Còn lại trước khi đóng Giai đoạn 6

1. Chạy `docker compose up` thật trên máy có Docker và chụp evidence.
2. Đo coverage và đạt ≥70% cho lõi (shared + accounting/PMS).
3. Rà soát bảo mật có hệ thống (dependency audit, IDOR, CSP, rate limit endpoint công khai) và vá.
4. PWA offline: service worker, cache shell, hàng đợi thao tác POS/housekeeping.
5. Đối chiếu đủ 8 tiêu chí nghiệm thu, cập nhật README/PROGRESS thành Gate 6 PASS.

---

## Giai đoạn 6 — kết quả kiểm thử, bảo mật & PWA (2026-10-25)

### Đã hoàn tất

- **Coverage**: shared 73,5% statements / 74,9% lines; API core 73,0% / 77,1%. Ngưỡng CI đặt 70% cho statements/lines, branches 60%, functions 60%.
- **Bảo mật**: audit production 0 high/critical sau khi override `postcss ≥8.5.18`, `multer ≥2.5`, `deepmerge-ts ≥8`, `zod ≥4.6.6`; 2 moderate còn lại không nằm trong đường xử lý trực tiếp. Helmet/CSP, CSRF, RBAC, chống IDOR, webhook HMAC và audit chain đều có test.
- **PWA**: `public/sw.js` cache shell, network-first cho navigation, cache-first cho asset, fallback `/offline`; đăng ký service worker ở production.
- **E2E**: `apps/web/e2e/flows.mjs` 5/5 PASS, 0 console error.
- **Docker Compose**: `docker-compose config` PASS (CLI 5.6.1) — cấu hình 6 service hợp lệ.
- **Acceptance**: 39 kiểm tra (thêm PWA); 82 unit shared + 37 integration API.

### Chưa thể xác minh trong môi trường này

- `docker compose up` cần Docker daemon; máy chỉ có CLI, không có daemon/VM. Đây là tiêu chí nghiệm thu duy nhất chưa chạy thật.
- 2 cảnh báo moderate từ audit chưa xử lý (không có bản vá tương thích hoặc nằm ngoài runtime).

### Để đóng hoàn toàn

1. Trên máy có Docker: `docker compose up -d --build`, đăng nhập đủ 15 vai trò, chụp log + screenshot.
2. Chạy `bash scripts/check-acceptance.sh` trong container và lưu evidence.
3. Cập nhật trạng thái Gate 6 thành PASS.
