# Ẩn doanh thu theo bộ phận

## Bộ phận không thấy doanh thu

```text
HOUSEKEEPING   Buồng phòng
MAINTENANCE    Bảo trì
PROPERTY_OPS   Vận hành cơ sở
UTILITIES      Năng lượng
HR             Nhân sự
IT             Công nghệ thông tin
PURCHASING     Mua hàng & Kho
```

## Bộ phận vẫn thấy

Các bộ phận tạo doanh thu/điều hành:

```text
ADMIN, FINANCE, SALES, TIKTOK,
ROOMS, FRONT_OFFICE, FNB, RESTAURANT,
BAR, KITCHEN, SPA, POOL, EVENTS,
ROOM_SERVICE, BAGALOG
```

Người dùng không gán bộ phận (ban điều hành) vẫn thấy.

## Phạm vi ẩn

- Nhóm menu **Thương mại**:
  - Doanh thu
  - Duyệt giá phòng
  - Kiểm toán đêm
  - Kênh bán
  - Hộp thư
  - Quan hệ khách hàng
  - Tiếp thị
  - Đánh giá
- Dashboard:
  - Thẻ **Doanh thu hôm nay**
  - Thẻ **ADR**
  - Biểu đồ **Doanh thu 14 ngày**
  - Doanh thu từng cơ sở
  - Chỉ số **TRevPAR**
- Command menu (⌘K) cũng lọc theo bộ phận.

## Kiểm tra

| Tài khoản | Thương mại | Doanh thu hôm nay | TRevPAR |
|---|---|---|---|
| admin | ✅ | ✅ | ✅ |
| frontdesk | ✅ | ✅ | ✅ |
| housekeeping | ❌ | ❌ | ❌ |
| hr | ❌ | ❌ | ❌ |

Direct URL `/revenue`, `/channels`, `/marketing`, `/night-audit` với housekeeping đều bị chặn bởi quyền.

Ảnh: `docs/evidence/housekeeping-no-revenue-1440.png`
