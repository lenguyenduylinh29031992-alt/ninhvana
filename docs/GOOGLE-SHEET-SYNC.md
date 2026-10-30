# Đồng bộ Google Sheet tự động

## Nguồn đang dùng

| Nguồn | Sheet | Tần suất |
|---|---|---|
| Chấm công Marketing TikTok | Google Sheet tháng 10/2026 | 15 phút |
| Lương & tạm ứng Marketing TikTok | Google Sheet tháng 10/2026 | 15 phút |
| Chi phí đi chợ TikTok | Google Sheet tháng 11/2026 | 15 phút |

Các sheet phải để chế độ **Anyone with the link can view** hoặc dùng CSV export công khai. API tải CSV bằng `gviz/tq?tqx=out:csv`.

## Cách hoạt động

- `GoogleSheetSyncService` chạy khi API khởi động:
  - **Tự động mỗi 15 phút**
  - Thêm một lần sau 30 giây
- Nhập:
  - Chấm công: tạo/cập nhật nhân viên TikTok và bản ghi `Attendance`.
  - Lương: cập nhật lương cơ bản, gross, tạm ứng, thực lãnh vào kỳ lương.
  - Chi phí: tải và lưu trạng thái nguồn; chưa tự ghi sổ chi phí.
- Trang **Nhân sự** có:
  - Nút **Đồng bộ Google Sheet** (tất cả nguồn)
  - Nút **Cập nhật chấm công** ngay trên bảng chấm công
  - Nút **Cập nhật lương** ngay trên bảng nhân sự/lương
  - Nút **Cập nhật** trên từng thẻ nguồn Google Sheet
  - Trạng thái lần đồng bộ gần nhất, số dòng, lỗi nếu có
- Bảng trạng thái: `GoogleSheetSync`.

## API cập nhật riêng từng nguồn

```text
POST /api/v1/hr/sheets/sync                 # tất cả
POST /api/v1/hr/sheets/attendance/sync      # chấm công
POST /api/v1/hr/sheets/payroll/sync         # lương
POST /api/v1/hr/sheets/shopping/sync        # chi phí
```

## Tắt tự động

Trong `.env`:

```env
GOOGLE_SHEET_SYNC_ENABLED=false
```

## Khi sheet đổi cấu trúc

Các cột được nhận theo tên:
- `Họ và tên`
- `Lương cơ bản`
- `Công chuẩn`
- `Tổng công thực tế`
- `Tạm ứng`
- `Lương thực lãnh`

Nếu đổi tên cột, sửa parser trong:
`apps/api/src/modules/hr/google-sheet-sync.service.ts`

## Giới hạn

- Chỉ đồng bộ 3 sheet Marketing TikTok hiện tại.
- Sheet riêng tư cần service account/Google Sheets API; hiện dùng CSV công khai.
- Không xóa dữ liệu cũ nếu sheet không còn dòng; chỉ cập nhật dòng hiện có.
- Chi phí đi chợ chưa tự tạo bút toán; cần duyệt trước khi ghi sổ.
