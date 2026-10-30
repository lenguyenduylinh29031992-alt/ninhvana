# NINHVANA — Tiến độ triển khai

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
| 6 | CRM, kiểm thử, bảo mật, PWA offline, đóng gói | ✅ Hoàn tất | **Gate 6 — PASS** | 8/8 tiêu chí |

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
- **Test**: 78 unit shared + **43 integration API** (thêm 3 CRM) + **38 kiểm tra acceptance**.
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
- **Acceptance**: 39 kiểm tra (thêm PWA); 82 unit shared + 43 integration API.

### Docker runtime — đã xác minh

- Cài Colima 0.10.3 + Docker 29.5.2; `colima start --cpu 4 --memory 6`.
- `docker-compose up -d --build` build thành công 2 image; 6 service healthy (db, redis, api, web, mailhog, backup).
- Seed tự động trong container: nền tảng → 30 ngày vận hành → tài chính → 24 tháng lịch sử.
- Phát hiện và sửa lỗi thật: Next rewrites bị bake lúc build với `localhost:4000`; thêm `ARG API_INTERNAL_URL=http://api:4000` trước build để proxy đúng trong container.
- `bash scripts/check-acceptance.sh` trong stack: **39/39 PASS**; dashboard container chụp tại `docs/evidence/docker-dashboard-1920.png`.
- Evidence: `docker-compose-stack.txt`, `docker-seed-log.txt`, `gate6-acceptance.txt`.

### Còn lại (không chặn nghiệm thu)

- 2 cảnh báo moderate audit không nằm trong đường runtime trực tiếp; theo dõi bản vá.

### Kết luận Gate 6

8/8 tiêu chí nghiệm thu đã có bằng chứng. Hệ thống hoàn chỉnh từ Giai đoạn 0 → 6.


---

## Bản sắc NinhVaNa & tài khoản ẩn danh (2026-10-25)

- Đổi thương hiệu hiển thị sang **Khách sạn NinhVaNa / NinhVaNa Group**; mã cơ sở `NVN-HAN`, `NVN-NVT`; email `@ninhvana.vn`; logo NV; PWA manifest và chứng từ.
- 15 tài khoản đổi sang **Nguyễn Văn A → O**, giữ nguyên chức vụ/vai trò và phạm vi cơ sở. Tên nhân sự trong HRM cũng được ẩn danh A → R, giữ phòng ban/chức danh.
- Tài khoản **Admin riêng**: `admin@ninhvana.vn` / `NinhVaNa@2026`, họ tên Nguyễn Văn A, vai trò **SUPER_ADMIN** với **toàn bộ 102 quyền** — quản lý người dùng, vai trò, cấu hình, tích hợp, audit và mọi nghiệp vụ. Có integration test riêng xác nhận đủ quyền.
- Dữ liệu khách hàng demo (guest) vẫn giữ tên hư cấu để minh hoạ nghiệp vụ; không phải tài khoản đăng nhập.
- Đã reset database Docker và seed lại; 39/39 acceptance, 43 integration API, 5/5 browser flows.


---

## Địa chỉ Ninh Vân & bộ cài đặt native (2026-10-25)

- Cơ sở thứ hai chuyển từ Đà Nẵng sang **NinhVaNa Beach Club Ninh Vân**, địa chỉ **Ninh Vân, Ninh Hòa, Khánh Hòa**; mã `NVN-NVT`, email quản lý `manager.ninhvan@ninhvana.vn`.
- **Desktop**: Electron shell trong `apps/desktop`, có màn hình cấu hình máy chủ, menu đổi server, đóng gói `.dmg` (macOS arm64) và `.exe` NSIS (Windows x64). Đã chạy thử app từ DMG và chụp `docs/evidence/desktop-app-1440.png`.
- **Android**: Capacitor project `apps/mobile`, launcher nhập địa chỉ máy chủ, APK debug-signed tại `dist/NinhVaNa-0.1.0-android.apk`; kiểm tra package `vn.ninhvana.app`, label NinhVaNa.
- **iOS**: Capacitor iOS project đã tạo, cấu hình ATS/local network, icon/splash; đóng gói source tại `dist/NinhVaNa-0.1.0-ios-source.zip`. **Chưa có .ipa cài trực tiếp** vì máy thiếu iOS platform runtime và Apple signing identity.
- Hướng dẫn cài: `docs/CAI-DAT-APP.md`; build lại: `scripts/build-apps.sh`.


---

## Marketing, khu vực & xuất dữ liệu (2026-10-25)

- **Marketing workspace**: bảng `MarketingItem` cây cha–con, seed 5 mục lớn + 13 mục con; API tree/create/update/delete với audit; UI `/marketing` có cây danh mục, nút **+** thêm mục lớn/mục con, trạng thái, kênh, ngân sách, ghi chú.
- **Sơ đồ khu vực**: bảng `PropertyArea`; seed Khu A (A1/A2/A3) theo đúng mô tả Ninh Vân, Khu B Bagalog, Khu C Bếp & Quầy Bar, Khu D Hồ Bơi; UI `/property-map`.
- **Xuất dữ liệu** (`/api/v1/exports/:dataset`): ExcelJS `.xlsx`, docx `.docx`, CSV, TSV; Google Sheets bằng cách sao chép TSV và mở `sheets.new`. Đã gắn vào marketing, sơ đồ, đặt phòng, khách, buồng phòng, CRM, lương, kênh, tài chính, chi phí và tài khoản.
- **Test**: 82 unit shared + **43 integration API** (thêm 4 marketing/export) + 39 acceptance; lint/typecheck/build xanh; 36 ảnh evidence.


## Chuẩn hóa ngôn ngữ & quyền đổi tên (2026-10-25)

- Rà soát tiêu đề/nhãn giao diện Việt: loại bỏ tiêu đề tiếng Anh (`Marketing Workspace`, `Guest Experience`, `Channel Manager`, `Night Audit`, `HR & Payroll`, `Finance & P&L`, `Report Builder`, `Cost Control`, `Tape chart`, `Social Commerce Inbox`, `Realtime`…), thay bằng tiếng Việt tương ứng.
- Nhãn thương hiệu/sidebar/footer dùng i18n; các thuật ngữ chuyên ngành giữ nguyên (P&L, GOP, OTA, OTB, KOL, ROI…).
- **Chỉ SUPER_ADMIN được đổi tên**: họ tên hồ sơ, tên người dùng trong quản trị và tên thương hiệu trong cấu hình. Các vai trò khác nhận 403; ô họ tên trên hồ sơ bị khoá kèm giải thích.
- Thêm test xác nhận CEO không đổi được tên, Admin đổi và khôi phục được; 43 integration test.


## Reset dữ liệu vận hành (2026-10-25)

- Thêm `apps/api/prisma/reset-operations.ts` + `pnpm db:clear` (yêu cầu `RESET_CONFIRM=YES`).
- Đã chạy trên database local: **khách=0, phòng=0, đặt phòng=0, bút toán=0, POS=0**; dashboard doanh thu/công suất/ADR/GOPPAR = 0.
- Giữ 15 tài khoản, 18 mục marketing, 7 khu vực, cấu hình, kênh, menu, nhà cung cấp, nhân sự và mặt hàng.
- Khôi phục mẫu bằng `pnpm db:reset` rồi các seed history/finance/long. Không chạy acceptance/test integration trên DB trống; bộ test cần seed demo.


## Rà soát module & TikTok (2026-10-25)

- Thêm **Kênh TikTok** (4 mục con) vào Marketing Workspace và bộ phận **Marketing TikTok** trong danh mục bộ phận.
- `/reviews` giờ chuyển tới tab Đánh giá của CRM; bỏ nhãn giai đoạn.
- Toàn bộ href menu đã có trang; các mục chưa xây dựng có trang lộ trình rõ ràng: Banquet (GĐ2), Budgets/HR/Roster (GĐ4), Assistant (GĐ5).
- Purchasing/Inventory/Revenue/Reviews là màn hình gộp/chuyển hướng, không phải module độc lập.
- Chi tiết: `docs/ROADMAP-AUDIT.md`. Marketing test 4/4 pass trên DB rỗng; full test/acceptance cần seed.


## Marketing TikTok HR + iOS runtime (2026-10-25)

- Nạp 3 nhân sự Marketing TikTok (Thảo Như, Tấn Việt, Mỹ Uyên), 69 bản ghi chấm công 01–25/10/2026; công thực tế 19/21/17.
- Kỳ lương 2026-10: tạm ứng 3.100.000 đ; thực lãnh 10.622.223 đ; thêm cột `advanceAmount` vào PayrollLine.
- Trang `/hr` có bảng công 31 ngày, tạm ứng/thực lãnh, link 3 Google Sheet; API `GET /hr/attendance`.
- iOS Simulator runtime 26.5 đã cài; app build/cài/chạy trên iPhone 17 Pro Simulator, ảnh `docs/evidence/ios-simulator-launcher.png`.
- Build thiết bị thật unsigned thành công (`dist/NinhVaNa-ios-unsigned.ipa`); chưa ký vì máy không có Apple ID/team (0 signing identity).
- Apple signing identity chưa có vì Xcode chưa đăng nhập Apple ID/team; hướng dẫn tại `docs/IOS-SETUP.md`.


## Một cơ sở & cơ cấu bộ phận (2026-10-25)

- Hợp nhất về **Khách sạn NinhVaNa** (`NVN`) tại Ninh Vân, Ninh Hòa, Khánh Hòa; xoá cơ sở thứ hai và chuyển phân quyền người dùng về cơ sở duy nhất.
- 22 bộ phận thuộc 3 phân khu: khách sạn (9), nhà hàng (4), dùng chung (9); thêm trường `division`.
- Gắn khu vực A1/A2/A3/B/C/D với nhóm bộ phận và mã bộ phận; thêm trang `/revenue` doanh thu theo khu vực/nhóm bộ phận.
- API `GET /hr/departments`; trang `/hr` hiển thị cơ cấu bộ phận sẵn sàng phân quyền sau.
- Reset lại dữ liệu vận hành lần cuối và nạp lại 3 nhân sự Marketing TikTok + 69 bản ghi công; doanh thu 0.


## Giao diện di động & bảo trì (2026-10-25)

- Thêm thanh điều hướng mobile 5 mục, nút tròn Trung tâm điều hành ở giữa, active màu xanh thương hiệu.
- Thêm overlay bảo trì toàn cục khi health check lỗi: thời gian chạy HH:MM:SS, địa chỉ máy chủ, thử lại, tự kiểm tra 15 giây.
- Native launcher có panel bảo trì tương tự, probe URL 6 giây, thử lại/đổi địa chỉ; đã build lại iOS simulator.
- Ảnh: `marketing-390.png`, `mobile-dashboard-390.png`, `maintenance-390.png`, `ios-launcher-390.png`, `ios-maintenance-panel.png`.


## Icon điều hướng theo bộ phận (2026-10-25)

- Thêm `User.departmentCode`; gán bộ phận cho 10 tài khoản demo (Lễ tân, Buồng phòng, Bếp, Nhà hàng, Nhân sự, Mua hàng, Marketing TikTok, Vận hành).
- Mobile bottom bar đổi icon/nhãn theo bộ phận: TikTok, Bếp, Buồng phòng, Lễ tân, Kế toán, Nhân sự, Mua hàng…
- Admin gán bộ phận khi tạo tài khoản hoặc đổi trực tiếp trong danh sách người dùng.
- Ảnh: `docs/evidence/marketing-dept-390.png`.


## Cố định nút Trung tâm (2026-10-25)

- Thanh mobile dùng hai cột trái/phải cân bằng; nút Trung tâm luôn ở giữa tuyệt đối dù icon bộ phận ít/nhiều hoặc bị ẩn do quyền.


## Nhân sự theo bộ phận & bảo trì đa nền tảng (2026-10-25)

- Nhấp thẻ bộ phận ở `/hr` để xem danh sách nhân viên, vị trí, trạng thái và lương cơ bản tương ứng.
- Chuyển 18 nhân sự demo sang mã bộ phận chi tiết: Lễ tân, Buồng phòng, Bếp, Nhà hàng, Bar, Kế toán, Kinh doanh, Bảo trì, Spa…
- Bảng bảo trì dùng chung cho web, iOS, Android và desktop Electron; desktop setup có đồng hồ chạy và thử lại.


## Sửa chọn phòng & dark mode (2026-10-25)

- Chọn phòng ở trang đặt phòng công khai và hộp thoại đặt phòng giờ có viền xanh, nền xanh nhạt, ring và nhãn **Đã chọn**.
- Dark mode: bật `color-scheme: dark`, đặt nền input/select/textarea theo `surface`, chữ theo `ink`, xử lý placeholder/autofill và option của select.
- Ảnh kiểm chứng: `docs/evidence/reservations-1920-dark.png`.


## Loại phòng, duyệt giá & chống zoom mobile (2026-10-25)

- Cấu hình 27 phòng/6 loại phòng đúng sơ đồ A1/A2/A3: DORM-A1 (6), DORM-A2 (6), VIEW-A2 (2), CONNECT-A2 (1), DOUBLE-A3 (10), FAMILY-A3 (2).
- Thêm quy trình `RateChangeRequest`/`RateApproval`: chỉ vai trò cấp cao được đề xuất/duyệt; gửi chữ ký online tới Tài chính, Kinh doanh, Ban giám đốc; duyệt xong mới áp dụng giá và biểu giá BAR.
- Trang `/rate-approvals`; chặn API với vai trò không cấp cao.
- Mobile: khóa zoom viewport, input 16px, thanh icon `position: fixed` + `translateZ(0)`; đã kiểm tra ở 390px.
- Ảnh: `docs/evidence/rate-approvals-1920.png`, `docs/evidence/room-selected-390.png`, `docs/evidence/mobile-zoom-390.png`.


## Dữ liệu thử, cập nhật & phiên bản (2026-10-26)

- Thêm dữ liệu demo có marker `DEMO-TEST`: 4 khách, 4 đặt phòng, 3 buồng phòng, 3 đánh giá, 2 chiến dịch, 2 chi phí; xoá bằng `demo-test-data.ts --clear`.
- Trang `/updates`: phiên bản máy chủ, uptime, hướng dẫn cập nhật theo thiết bị, lịch sử phát hành.
- Rà soát gói cài: web/iOS Simulator đã cập nhật; APK Android và DMG/EXE desktop cần build lại để có launcher bảo trì mới.


## Demo data, update center & desktop packages (2026-10-26)

- Thêm bộ dữ liệu demo có marker, tạo/xoá bằng `demo-test-data.ts`; 4 khách, 4 đặt phòng, 3 buồng phòng, 3 review, 2 campaign, 2 expense.
- Thêm trang `/updates` theo dõi phiên bản/uptime/lịch sử phát hành và hướng dẫn cập nhật web, desktop, iOS, Android.
- Build lại DMG macOS và bộ cài Windows từ source; APK Android vẫn là bản cũ do thiếu SDK.


## Android SDK & APK (2026-10-26)

- Cài Android command-line tools, platform-tools, Android 35 và build-tools 35.0.0.
- Sync Capacitor assets mới và build APK thành công.
- `dist/NinhVaNa-0.1.0-android.apk`: `vn.ninhvana.app`, version 0.1.0, minSdk 23 / targetSdk 35, debug-signed.
- Hướng dẫn: `docs/ANDROID-SETUP.md`.


## Offline queue, tự tìm máy chủ & VPS (2026-10-26)

- Launcher mobile có nút **Tự động tìm**: thử URL đã lưu, máy chủ công khai, `ninhvana.local`; gợi ý URL nào phản hồi.
- Thêm hàng đợi thao tác ghi offline + thanh trạng thái + tự đồng bộ khi online; xoá queue khi đăng xuất.
- Thêm `docker-compose.prod.yml`, `Caddyfile`, `.env.prod.example`, hướng dẫn VPS để không phụ thuộc Mac.
- Tài liệu: `OFFLINE-SYNC.md`, `DEPLOY-VPS.md`, `REMOTE-ACCESS.md`.


## iOS simulator / auto discovery / offline (2026-10-26)

- Build lại iOS Simulator với launcher tự tìm máy chủ; cài và chạy trên `NinhVaNa iPhone`.
- Android APK rebuild sau khi sync launcher mới.
- Thêm hàng đợi offline và thanh trạng thái; tự đồng bộ khi online.
- Thêm compose production + Caddy + hướng dẫn VPS; websocket same-origin cho production.


## Badge thông báo theo mục/tài khoản (2026-10-26)

- Thêm `UserSectionRead` và API `/notifications/badges`, `/notifications/read`.
- Sidebar desktop và thanh mobile hiển thị số cập nhật chưa đọc theo từng mục; tự đánh dấu đã đọc khi mở mục.
- Ảnh: `docs/evidence/nav-badges-1920.png`, `docs/evidence/nav-badges-390.png`.


## Cloudflare Worker gateway (2026-10-26)

- Deploy Worker `ninhvana` tại `https://ninhvana.lenguyenduylinh29031992.workers.dev`.
- Worker proxy HTTP/WebSocket tới origin; đã test đăng nhập dashboard qua URL Cloudflare.
- Thêm `wrangler.toml`, `cloudflare/worker.js`, tài liệu tên miền riêng.
- Chưa có zone/tên miền riêng; tài khoản cần thêm domain để gắn custom domain.


## Tên miền test miễn phí (2026-10-26)

- Chốt dùng `ninhvana.lenguyenduylinh29031992.workers.dev` cho bản test, không cần mua domain.
- Thêm GitHub Pages redirect tại `docs/index.html` để có URL `github.io` miễn phí khi repo được push.


## Reset URL test Cloudflare (2026-10-26)

- Đổi URL mặc định mobile/desktop sang `https://ninhvana.lenguyenduylinh29031992.workers.dev/login`.
- Rebuild APK Android, iOS Simulator, DMG macOS và bộ cài Windows với URL mới.
- Trang `/updates` hiển thị link test hiện tại.


## Phương án VPS miễn phí (2026-10-26)

- Rà soát free tier: Oracle Always Free là lựa chọn 0 đồng khả thi nhất nhưng cần tài khoản/thẻ xác minh.
- Ghi hướng dẫn dùng `sslip.io` miễn phí thay tên miền riêng, Worker vẫn giữ link workers.dev.
- Chưa thể deploy vì chưa có IP/SSH/tài khoản VPS.


## Sửa app bảo trì do tunnel hết hạn (2026-10-27)

- Quick tunnel cũ không còn DNS; Worker trả 530/maintenance.
- Khởi động tunnel mới, cập nhật `ORIGIN_URL`, deploy lại Worker; app login hoạt động.
- Sửa script lấy URL tunnel bằng `strings` để tránh log nhị phân.


## Tự động đồng bộ Google Sheet (2026-10-30)

- Thêm `GoogleSheetSyncService`: tự đồng bộ chấm công/lương Marketing TikTok mỗi 15 phút.
- Nút **Đồng bộ Google Sheet** + trạng thái nguồn/dòng/lần cuối trong trang Nhân sự.
- Thêm bảng `GoogleSheetSync`; API `/hr/sheets/status`, `/hr/sheets/sync`.
- Chi phí đi chợ hiện tải nguồn/đối soát, chưa tự ghi sổ.
