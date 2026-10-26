# Offline & đồng bộ khi có mạng

## Hiện tại đã có

- PWA service worker (`apps/web/public/sw.js`) cache app shell và trang `/offline`.
- Hàng đợi thao tác ghi (`POST/PATCH/PUT/DELETE`) trong `localStorage`:
  - Khi mất mạng, thao tác được lưu trên thiết bị thay vì mất.
  - Thanh trạng thái hiện **Ngoại tuyến** / **N thay đổi đang chờ đồng bộ**.
  - Khi có mạng, app tự gửi lại theo thứ tự và hiện **Đã đồng bộ**.
- Nút **Đồng bộ ngay**.
- Đăng xuất sẽ xoá hàng đợi để tránh dữ liệu của tài khoản trước bị gửi nhầm.

Mã chính: `src/lib/offline-sync.ts`, `api.ts`, `offline-sync-bar.tsx`.

## Giới hạn cần biết

Đây là **hàng đợi ghi**, chưa phải cơ sở dữ liệu offline đầy đủ:

- Chỉ áp dụng khi app đã mở ít nhất một lần và trang đã được cache.
- Không hỗ trợ đăng nhập mới khi hoàn toàn offline.
- Không tải trước toàn bộ dữ liệu của tài khoản.
- File/ảnh đính kèm chưa được queue.
- Nếu hai thiết bị sửa cùng bản ghi, cần quy tắc conflict-resolution.
- Server hiện chưa chống trùng theo `X-Offline-Sync`; không nên dùng queue cho thanh toán/POS.

## Muốn offline toàn bộ dữ liệu

Cần chuyển sang kiến trúc **local-first**:

1. SQLite/IndexedDB trên thiết bị cho dữ liệu của từng tài khoản.
2. Đồng bộ hai chiều có version/updatedAt, idempotency key và conflict resolution.
3. Cache danh mục, phòng, khách, đặt phòng, công việc… trước khi offline.
4. Hàng đợi outbox có trạng thái thành công/thất bại và retry có kiểm soát.
5. Không cho phép các nghiệp vụ tài chính/POS offline nếu chưa có đối soát.

Đây là hạng mục lớn, nên làm sau khi máy chủ đã chạy 24/7 trên VPS.
