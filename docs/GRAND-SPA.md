# Grand Spa

Grand Spa là mục điều hướng riêng, không nằm trong Nhà hàng & bán hàng.

## Đường dẫn

```text
/spa
```

## Điều hướng

- Nhóm sidebar mới: **SPA & CHĂM SÓC**
- Mục: **Grand Spa**
- Quyền: `pos:view`
- Nhân sự bộ phận `SPA` trên mobile được đưa thẳng tới `/spa`.

## Chức năng

- Chọn outlet loại `SPA` (Grand Spa).
- Danh mục liệu trình: Massage Thái, Massage đá nóng, Facial Hydra…
- Phòng trị liệu.
- Tạo liệu trình khách lẻ hoặc chọn phòng.
- Thêm dịch vụ, gửi yêu cầu, thanh toán/ghi nợ phòng.
- Không hiển thị màn hình bếp trong Spa.

## Tách khỏi Nhà hàng

- `/pos` chỉ còn outlet `RESTAURANT` và `BAR`.
- Outlet `SPA` không còn xuất hiện trong danh sách nút của POS nhà hàng.
- Nhà hàng vẫn giữ màn hình bếp, sơ đồ bàn và order món.

## Kiểm tra

- `/spa`: tiêu đề **Grand Spa**, không lỗi.
- `/pos`: không còn nút **Grand Spa**.
- Ảnh: `docs/evidence/grand-spa-1440.png`
