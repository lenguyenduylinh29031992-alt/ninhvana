# Rà soát mô-đun & giai đoạn

Cập nhật: 25/10/2026, sau khi dữ liệu vận hành được reset về 0.

## Đã có và dùng được

| Nhóm | Màn hình / route |
|---|---|
| Tổng quan | `/dashboard`, `/analytics`, `/reports` |
| Vận hành | `/front-desk`, `/tape-chart`, `/reservations`, `/guests`, `/housekeeping`, `/property-map` |
| Bán hàng | `/pos`, `/pos/kds`, `/channels`, `/inbox` |
| Marketing | `/marketing` — cây mục lớn/mục con; có **Kênh TikTok** với 4 mục con (Lịch đăng, Video ngắn, TikTok Shop, KOL) và bộ phận **Marketing TikTok** trong danh mục bộ phận |
| Quan hệ khách hàng | `/crm`; `/reviews` chuyển thẳng tới tab Đánh giá |
| Tài chính | `/finance`, `/costs`, `/payroll` |
| Quản trị | `/admin/users`, `/admin/roles`, `/admin/audit`, `/settings`, `/settings/integrations` |

Tất cả `href` trong menu hiện có trang tương ứng (không còn link 404).

## Các màn hình gộp / chuyển hướng

| Mục | Hành vi |
|---|---|
| `/revenue` | Chuyển tới `/analytics` (doanh thu hợp nhất) |
| `/purchasing` | Chuyển tới `/costs` (mua hàng + công nợ) |
| `/inventory` | Chuyển tới `/costs` (tồn kho) |
| `/reviews` | Chuyển tới `/crm?tab=REVIEWS` |

Các mục này **không phải module độc lập**; chức năng đã nằm trong màn hình đích.

## Chưa hoàn tất — đang có trang thông báo lộ trình

| Mục | Giai đoạn | Trạng thái |
|---|---|---|
| `/banquet` — Tiệc & sự kiện | GĐ2 | Trang “đang hoàn thiện”; chưa có hợp đồng tiệc/menu/đặt cọc |
| `/budgets` — Ngân sách | GĐ4 | Trang “đang hoàn thiện”; chưa có model ngân sách và duyệt điều chỉnh |
| `/hr` — Nhân sự chuyên sâu | GĐ4 | Trang “đang hoàn thiện”; hồ sơ nhân sự & chấm công cơ bản đang nằm trong `/payroll` |
| `/roster` — Lịch làm việc | GĐ4 | Trang “đang hoàn thiện”; chưa có phân ca/đổi ca |
| `/assistant` — Trợ lý vận hành | GĐ5 | Trang “đang hoàn thiện”; chưa có backend hỏi đáp dữ liệu |

Các trang này không giả lập dữ liệu; chúng nêu rõ phần nào chưa có và liên kết tới màn hình thay thế.

## Ghi chú kiểm thử sau reset

Database hiện tại đang **rỗng dữ liệu vận hành** theo yêu cầu. Vì vậy:

- `test/marketing.spec.ts`: **4/4 pass** (marketing, khu vực, TikTok, export).
- Các integration test còn lại cần seed khách/phòng/doanh thu; chạy `pnpm db:reset` + các seed history/finance/long trước khi chạy toàn bộ.
- 39 acceptance checks cũng cần seed demo.
