# Giao diện di động NinhVaNa

## Thanh điều hướng dưới

Trên màn hình `< 1024px`, thanh icon cố định ở đáy gồm 5 mục:

| Vị trí | Mục | Route | Icon |
|---|---|---|---|
| 1 | Vận hành | `/front-desk` | Chuông lễ tân |
| 2 | Bán hàng | `/pos` | Dao nĩa |
| **Giữa** | **Trung tâm điều hành** | `/dashboard` | Nút tròn nổi |
| 4 | Tiếp thị | `/marketing` | Loa |
| 5 | Tài chính | `/finance` | Ví |

- Mục đang chọn có nền xanh nhạt, icon và nhãn màu xanh thương hiệu.
- Nút tròn giữa **luôn cố định ở chính giữa** bằng hai cột trái/phải cân bằng, bất kể bộ phận có ít hay nhiều icon. Khi ở Trung tâm điều hành, nút chuyển màu xanh đậm và có vòng sáng.
- Mục không có quyền sẽ tự ẩn; nút giữa vẫn hiện nếu có `dashboard:view`.
- **Icon thay đổi theo bộ phận của tài khoản** (`User.departmentCode`):
  - Lễ tân → Lễ tân; Buồng phòng → Buồng phòng; Bộ phận Phòng → Sơ đồ phòng.
  - Bếp → Bếp (KDS); Nhà hàng/Bar/Dịch vụ phòng → POS tương ứng.
  - Marketing TikTok → **TikTok**; Kinh doanh → Kinh doanh.
  - Kế toán → Kế toán; Mua hàng → Mua hàng; Nhân sự → Nhân sự.
  - Các bộ phận vận hành/bảo trì → Cơ sở; IT/Hành chính → Cấu hình/Tích hợp.
- Admin có thể gán bộ phận khi tạo tài khoản hoặc đổi trực tiếp trong **Quản trị → Người dùng**.
- Nội dung trang có padding đáy để không bị thanh điều hướng che.

Ảnh kiểm chứng: `docs/evidence/marketing-390.png`, `docs/evidence/mobile-dashboard-390.png`.

## Bảng “Hệ thống đang bảo trì”

### Trong ứng dụng web
Khi `/api/v1/health/live` lỗi hoặc thiết bị mất mạng, overlay hiện:
- Tiêu đề **Hệ thống đang bảo trì**.
- **Thời gian chạy** dạng `HH:MM:SS`, cập nhật mỗi giây.
- Địa chỉ máy chủ hiện tại.
- Nút **Thử kết nối lại**; tự kiểm tra lại mỗi 15 giây.

Ảnh: `docs/evidence/maintenance-390.png`.

### Trong app native (launcher)
Trước khi mở WebView, app kiểm tra URL máy chủ bằng `fetch(mode:no-cors)` với timeout 6 giây. Nếu lỗi:
- Không chuyển sang trang trắng/không có phản hồi.
- Hiện panel **Hệ thống đang bảo trì**, đồng hồ chạy, địa chỉ máy chủ.
- **Thử kết nối lại** hoặc **Đổi địa chỉ**.

Ảnh: `docs/evidence/ios-maintenance-panel.png`, `docs/evidence/ios-launcher-390.png`.

## Chạy lại kiểm tra giao diện

```bash
pnpm --filter @grand-suite/web exec node e2e/screenshots.mjs
```

Script chụp desktop, marketing mobile, dashboard mobile và mô phỏng lỗi health để chụp bảng bảo trì.


Ảnh minh họa tài khoản Marketing TikTok có icon **TikTok**: `docs/evidence/marketing-dept-390.png`.
