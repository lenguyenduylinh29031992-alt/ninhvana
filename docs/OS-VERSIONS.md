# Trạng thái phiên bản theo hệ điều hành

Cập nhật: 26/10/2026.

| Nền tảng | Gói / cách chạy | Giao diện mới | Ghi chú |
|---|---|---|---|
| Web | `pnpm start` / trình duyệt | **Đã cập nhật** | Luôn dùng bundle web mới sau build/restart |
| iOS Simulator | `dist/NinhVaNa-ios-simulator.zip` | Đã build lại launcher bảo trì | Web bên trong tải từ máy chủ hiện tại |
| iOS thiết bị | `dist/NinhVaNa-ios-unsigned.ipa` | Chưa ký | Cần Apple ID/team để ký; bản simulator không cần |
| Android | `dist/NinhVaNa-0.1.0-android.apk` | **Đã cập nhật 26/10** | Build bằng SDK 35; APK debug đã ký debug; xem `docs/ANDROID-SETUP.md` |
| Desktop macOS | `dist/NinhVaNa-0.1.0-macos-arm64.dmg` | **Đã cập nhật 26/10** | Build lại từ source, có panel bảo trì; chưa ký Apple |
| Desktop Windows | `dist/NinhVaNa-0.1.0-windows-x64-setup.exe` | **Đã cập nhật 26/10** | Build lại từ source, có panel bảo trì; chưa ký chứng chỉ |
| Desktop Linux | Chưa đóng gói | — | Có thể chạy `pnpm --filter @ninhvana/desktop start` |

## Điểm quan trọng

- Các tính năng web mới (bộ phận, TikTok, giá phòng, cập nhật, HR…) nằm trên **máy chủ web**; app native mở WebView trỏ tới máy chủ nên sẽ thấy giao diện mới ngay khi kết nối đúng URL.
- Các thay đổi **launcher native** (panel bảo trì, khoá zoom, màn hình kết nối) chỉ có sau khi build lại gói cài tương ứng.
- Bộ cài desktop và APK Android đã build lại; bản web/iOS Simulator đã được kiểm tra. iOS thiết bị thật vẫn cần chữ ký Apple.
- iOS thiết bị thật vẫn cần Apple signing identity.
