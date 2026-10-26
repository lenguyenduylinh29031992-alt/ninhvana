# Badge thông báo theo mục và tài khoản

Mỗi mục điều hướng có số cập nhật **chưa đọc** riêng cho từng tài khoản.

## Cách hoạt động

- Bảng `UserSectionRead` lưu `userId + section + readAt`.
- `GET /api/v1/notifications/badges?propertyId=…` trả số bản ghi cập nhật sau `readAt` cho các mục tài khoản có quyền.
- Khi mở một mục, frontend gọi `POST /api/v1/notifications/read` và badge của mục đó được làm mới.
- Badge hiển thị trên sidebar desktop, thanh icon mobile; quá 99 hiện `99+`.
- Số liệu được tính theo tài khoản hiện tại; đăng nhập tài khoản khác sẽ thấy trạng thái đọc riêng.

## Các mục đang theo dõi

| Mục | Nguồn dữ liệu |
|---|---|
| Lễ tân / Đặt phòng | Reservation cập nhật |
| Khách hàng | Guest cập nhật |
| Buồng phòng | HousekeepingTask cập nhật |
| Đánh giá | GuestReview mới |
| Hộp thư | Conversation cập nhật |
| Tiếp thị | MarketingItem cập nhật |
| Nhân sự | Employee mới |
| Chi phí | Expense mới |
| Duyệt giá phòng | RateChangeRequest đang chờ |
| Cập nhật phần mềm | Có bản phát hành mới |

## Lưu ý

- Lần đầu tài khoản chưa có `UserSectionRead`: các badge dữ liệu bằng 0 (trừ bản cập nhật phần mềm). Sau khi mở mục, mốc đọc được tạo.
- Badge phản ánh **dữ liệu mới hơn lần đọc gần nhất**, không phải số bản ghi chưa xem tuyệt đối.
- Quyền truy cập vẫn do RBAC quyết định; badge không thay thế kiểm tra quyền.
