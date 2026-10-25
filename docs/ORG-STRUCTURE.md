# Cơ cấu tổ chức & doanh thu

## Một cơ sở duy nhất

- **Khách sạn NinhVaNa** — mã `NVN`, loại `HOTEL`.
- Địa chỉ: Ninh Vân, Ninh Hòa, Khánh Hòa.
- Các khu vực vận hành: A (A1, A2, A3), B Bagalog, C Bếp & Quầy Bar, D Hồ bơi.
- Cơ sở thứ hai `NVN-NVT` đã được hợp nhất/loại bỏ; dữ liệu cũ chuyển về cơ sở duy nhất.

## 22 bộ phận

| Phân khu | Bộ phận |
|---|---|
| Khách sạn | Bộ phận Phòng, Lễ tân, Buồng phòng, Dịch vụ phòng, Bagalog, Hồ bơi, Spa & Giải trí, Ẩm thực & Đồ uống, Vận hành cơ sở |
| Nhà hàng | Nhà hàng, Quầy bar, Bếp, Tiệc & Hội nghị |
| Dùng chung | Kinh doanh & Tiếp thị, Marketing TikTok, Tài chính & Kế toán, Nhân sự, Mua hàng & Kho, Công nghệ thông tin, Hành chính, Bảo trì, Năng lượng |

Mỗi bộ phận có `code`, `division`, `group`, `isRevenueCenter`, `sortOrder` trong bảng `Department`. Người dùng có `departmentCode` để thanh điều hướng điện thoại hiển thị đúng icon/màn hình chính của bộ phận. Đây là nền để gắn chức danh và phân quyền theo bộ phận ở giai đoạn sau.

## Doanh thu nhiều khu vực

Trang `/revenue` hiển thị:

- Doanh thu theo khu vực: A1, A2, A3 (phòng), B (Bagalog), C (nhà hàng/bar/bếp), D (hồ bơi).
- Doanh thu theo nhóm bộ phận: Phòng, Ẩm thực & Đồ uống, Dịch vụ khác.
- Danh sách bộ phận trực thuộc từng nhóm và tỷ trọng.

Hiện dữ liệu doanh thu đang bằng 0 theo yêu cầu reset. Khi phát sinh bút toán, sổ cái sẽ cộng vào nhóm bộ phận tương ứng; cấu trúc khu vực/bộ phận đã sẵn sàng.

## Nhân sự theo bộ phận

Trang `/hr` có 22 thẻ bộ phận. Nhấp vào thẻ sẽ:
- Đổi tiêu đề sang bộ phận đang chọn.
- Hiện danh sách nhân viên của bộ phận: mã, họ tên, vị trí/chức danh, trạng thái, lương cơ bản.
- Với Marketing TikTok, hiện thêm tạm ứng/thực lãnh và bảng chấm công tháng 10.
- Bộ phận chưa có nhân viên hiện thông báo trống.

## Ghi chú phân quyền

Hiện phân quyền theo vai trò + cơ sở (`UserPropertyRole`). Chưa gắn quyền theo từng bộ phận để tránh thay đổi RBAC đột ngột. Khi cần, có thể thêm `departmentId` vào phân quyền người dùng và kiểm tra quyền theo bộ phận mà không đổi dữ liệu kế toán.


## Loại phòng & duyệt giá

Xem [`ROOM-TYPES-RATES.md`](ROOM-TYPES-RATES.md): 27 phòng theo A1/A2/A3, 6 loại phòng; thay đổi giá chỉ dành cho lãnh đạo cấp cao và phải qua chữ ký duyệt của các bộ phận liên quan.
