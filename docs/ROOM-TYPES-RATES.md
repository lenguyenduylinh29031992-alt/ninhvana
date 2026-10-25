# Loại phòng & quy trình duyệt giá

## Sơ đồ phòng hiện tại

| Khu | Loại phòng | Số phòng | Mã |
|---|---|---:|---|
| A1 — Tầng trệt | Dormitory giường tầng | 6 | DORM-A1 |
| A2 — Tầng 2 | Dormitory giường tầng | 6 | DORM-A2 |
| A2 — Tầng 2 | Phòng View trước | 2 | VIEW-A2 |
| A2 — Tầng 2 | Connecting Room | 1 | CONNECT-A2 |
| A3 — Tầng 3 | Phòng đôi | 10 | DOUBLE-A3 |
| A3 — Tầng 3 | Phòng gia đình gác lửng | 2 | FAMILY-A3 |

Tổng **27 phòng**. Sảnh chung A3 không tính là phòng bán. Giá cơ bản hiện tại: 850.000–3.500.000 đ.

## Quyền thay đổi giá

Chỉ các vai trò cấp cao mới được tạo yêu cầu hoặc trực tiếp thay đổi giá:
- SUPER_ADMIN
- CHAIRMAN
- CEO
- CFO
- REVENUE_DIRECTOR
- PROPERTY_MANAGER

API kiểm tra cả quyền `rate:update` và vai trò cấp cao; tài khoản bộ phận thường nhận **403**.

## Quy trình phê duyệt & ký online

Trang **Thương mại → Duyệt giá phòng** (`/rate-approvals`):

1. Lãnh đạo chọn loại phòng, giá hiện tại, giá đề xuất, ngày hiệu lực và lý do.
2. Chọn bộ phận cần ký: Tài chính & Kế toán, Kinh doanh & Tiếp thị, Ban giám đốc/Hành chính.
3. Gửi yêu cầu — mỗi bộ phận có một bước duyệt riêng.
4. Đại diện bộ phận mở yêu cầu, nhập họ tên/chữ ký và ý kiến, chọn **Ký duyệt** hoặc **Từ chối**.
5. Khi tất cả bộ phận duyệt:
   - Cập nhật `RoomType.baseRate`.
   - Cập nhật biểu giá **BAR** trong khoảng ngày hiệu lực.
   - Ghi audit log.
6. Nếu một bộ phận từ chối, yêu cầu chuyển **Từ chối**, giá không đổi.

Mọi thao tác được lưu trong `RateChangeRequest` / `RateApproval`.
