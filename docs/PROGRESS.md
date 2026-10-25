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
| 5 | Dashboard đầy đủ, report builder, AI, dự báo, seed 24 tháng | ⏳ Tiếp theo | <2s, số liệu khớp 3 chiều |
| 6 | Kiểm thử, bảo mật, hiệu năng, PWA offline, tài liệu | ⬜ Chưa | 8/8 tiêu chí |

---

## Giai đoạn 2 — Vận hành (tóm tắt)

29 model PMS/POS; chống overbooking 3 lớp (Redis lock → advisory lock → `EXCLUDE USING gist`); luồng booking → check-in → POS ghi nợ → night audit → checkout → thanh toán → hoá đơn; sổ cái kép là nguồn sự thật; 10 request đồng thời chỉ 1 thành công; seed 30 ngày (3.638 stays, 7.251 room-nights, 2.457 POS orders). Gate 2: 78 unit + 15 integration test, 25 kiểm tra.

## Giai đoạn 3 — Kênh bán (tóm tắt)

17 adapter mock (8 OTA + 9 social); ARI idempotent với retry/backoff/DLQ; webhook HMAC chống replay; pull booking thật vào PMS; booking engine công khai `/book`; inbox 9 kênh; doanh thu net sau hoa hồng theo kênh. Gate 3: 23 integration test, 28 kiểm tra.

---

## Giai đoạn 4 — Chi phí, HRM và báo cáo tài chính (hoàn tất)

### Mô hình dữ liệu (1 migration, 16 bảng)

- **Mua hàng**: `Supplier`, `PurchaseRequest`, `PurchaseOrder`/`Line`, `GoodsReceipt`/`Line`, `SupplierInvoice`, `SupplierPayment`.
- **Kho**: `InventoryItem`, `StockBalance`, `StockMovement` (IN/OUT/OPENING), định mức tối thiểu.
- **Chi phí**: `Expense` theo tài khoản/bộ phận, thanh toán ngay hoặc qua AP.
- **HRM/payroll**: `Employee`, `Attendance`, `PayrollRun`, `PayrollLine`.
- **Sổ cái**: mọi chứng từ đều sinh bút toán qua `PostingService`; không có đường ghi tắt.

### Nghiệp vụ đã chạy thật

1. **PR → PO → GRN**: yêu cầu mua có dòng hàng, duyệt tạo đơn theo nhà cung cấp, nhận hàng cập nhật tồn kho + bút toán `Dr 1520 / Cr 3310`.
2. **Hoá đơn NCC**: ghi nhận chi phí + VAT đầu vào + AP; thanh toán `Dr 3310 / Cr 1120`, cập nhật tuổi nợ.
3. **Xuất kho**: trừ tồn theo giá bình quân, `Dr 5000/5200 / Cr 1520`, ghi COGS F&B.
4. **Chi phí**: ghi nhận và hạch toán ngay `Dr chi phí + VAT / Cr tiền`, ảnh hưởng P&L tức thì.
5. **Payroll**: tính từ hợp đồng + chấm công + tăng ca; khấu trừ BHXH/BHYT/BHTN/KPCĐ, thuế TNCN lũy tiến; hạch toán `Dr 6000/6010 / Cr 3340/3380/3335`; chi trả `Dr 3340 / Cr 1120`.
6. **P&L USALI**: doanh thu, COGS, lương, chi phí vận hành, chi phí cố định, **GOP**, **GOPPAR**, **RevPAR**, lợi nhuận sau thuế, lợi nhuận từng bộ phận.
7. **Bảng cân đối**: tài sản/nợ/vốn + lợi nhuận giữ lại tính từ sổ; kiểm tra cân bằng tự động.
8. **Lưu chuyển tiền tệ**: phân loại kinh doanh/đầu tư/tài chính từ các entry có tiền mặt/ngân hàng.
9. **Tuổi nợ AR/AP**: bucket trong hạn/1–30/31–60/61–90/>90 theo ngày đến hạn.

### UI mới

- `/finance`: 5 tab P&L, cân đối kế toán, dòng tiền, phải thu, phải trả.
- `/costs`: chi phí, tồn kho, công nợ NCC; dialog ghi chi phí.
- `/payroll`: nhân sự, kỳ lương, tính/hạch toán/chi trả.
- `/purchasing`, `/inventory` chuyển hướng vào Cost Control (một màn hình vận hành).

### Seed tài chính

- 18 nhân viên/cơ sở, chấm công 22 ngày, 2 kỳ lương (kỳ trước PAID, kỳ hiện tại POSTED).
- 8 nhà cung cấp, 10 mặt hàng, tồn kho đầu kỳ + 4 tuần xuất kho COGS.
- Hoá đơn điện/nước/vệ sinh/marketing/bảo trì 2 tháng, thanh toán kỳ trước; thuê mặt bằng + bảo hiểm cố định.
- Chạy lại: `pnpm db:seed:finance` (idempotent).

### Bằng chứng Gate 4

| Hạng mục | Kết quả |
|---|---|
| `pnpm lint` · `typecheck` · `build` | ✅ 0 lỗi |
| Unit test shared | ✅ **78/78** |
| Integration API | ✅ **29/29** (thêm 6 test tài chính) |
| P&L tháng hiện tại (GSL-HAN) | ✅ Doanh thu ~27,6 tỷ · lương 456,5 triệu · **GOP 24,06 tỷ** · **GOPPAR 3,08 triệu/phòng-đêm** |
| Bảng cân đối | ✅ Tài sản = Nợ + Vốn; **lệch 0 ₫** |
| Payroll | ✅ Chạy → hạch toán → chi trả; trạng thái PAID; bút toán cân bằng |
| Mua hàng | ✅ PR → duyệt → nhận hàng làm tăng tồn kho, sinh AP |
| Chi phí | ✅ Ghi chi phí làm tăng P&L đúng một lần |
| AR/AP aging | ✅ AP 458 triệu, 6 hoá đơn, bucket đúng hạn |
| Acceptance script | ✅ **33/33** |
| Audit chain | ✅ Hợp lệ sau toàn bộ giao dịch tài chính |

### Giới hạn có chủ ý

- Báo cáo P&L hiện theo **một cơ sở** mỗi lần; hợp nhất tập đoàn sẽ ở Phase 5 (dashboard).
- AR aging dựa trên `Invoice` của PMS; các khoản phải thu nội bộ chỉ có trong sổ cái.
- Chưa có màn hình duyệt PR/PO đầy đủ (backend + seed đã có); UI hiện tập trung chi phí/kho/AP.
- Giá vốn món ăn dùng xuất kho định kỳ, chưa chạy recipe costing theo từng order POS.
- Bảng lương dùng bảng thuế TNCN rút gọn 7 bậc, chưa có giảm trừ người phụ thuộc theo đăng ký thực tế.
- Docker vẫn chưa chạy được trên máy này; entrypoint đã bổ sung seed tài chính.

---

## Giai đoạn 5 — Kế hoạch kế tiếp

1. **Dashboard hợp nhất**: doanh thu, GOP, GOPPAR, RevPAR theo cơ sở/kênh/bộ phận; P&L mini; công nợ; công suất; ADR; ALOS; so sánh MoM/YoY.
2. **Seed 24 tháng** bằng generator hiện tại + mùa vụ, lạm phát, tỷ giá; đủ dữ liệu cho forecast.
3. **Report builder**: lưu báo cáo, tham số, xuất PDF/Excel; lịch gửi email.
4. **AI/forecast**: dự báo công suất/doanh thu, phát hiện bất thường chi phí, gợi ý giá.
5. **Realtime & hiệu năng**: WebSocket cho KPI, cache Redis, mục tiêu dashboard <2s.
6. Gate 5: dashboard khớp 3 chiều (tổng = bộ phận = kênh = sổ), 24 tháng dữ liệu, xuất báo cáo, forecast có backtest.

## Rủi ro đang mở

1. **Docker chưa kiểm chứng** trên môi trường có Docker.
2. **Lịch sử 30 ngày** — cần 24 tháng trước báo cáo MoM/YoY.
3. **UI mua hàng** chưa đầy đủ; backend đã sẵn sàng.
4. **Đối soát liên công ty** (intercompany) chưa làm; sổ cái có tài khoản 1360 nhưng chưa tự động.
5. **Recipe costing** cần nối POS order → định lượng → trừ kho.

## Nhật ký quyết định

- 2026-10-25: GL là nguồn sự thật duy nhất cho mọi báo cáo tài chính (ADR-02).
- 2026-10-25: Pin PostgreSQL UTC để `@db.Date` đúng.
- 2026-10-25: Kênh dùng adapter + idempotency key; webhook HMAC.
- 2026-10-25: Booking engine gọi lại `ReservationsService` để giữ khoá/exclusion.
- 2026-10-25: Payroll và chi phí đều đi qua `PostingService`; không có bút toán ngoài sổ.
- 2026-10-25: Bảng cân đối tính lợi nhuận giữ lại từ P&L lũy kế thay vì bắt buộc kết chuyển 4210, nhờ vậy luôn cân bằng mà không cần bút toán khoá sổ.
