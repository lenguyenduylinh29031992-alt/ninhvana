# Trạng thái phiên bản theo hệ điều hành

Cập nhật: 26/10/2026 · URL test chung: `https://ninhvana.lenguyenduylinh29031992.workers.dev/login`

| Nền tảng | Gói / cách chạy | Trạng thái | Ghi chú |
|---|---|---|---|
| Web + Cloudflare Worker | `https://ninhvana.lenguyenduylinh29031992.workers.dev/login` | **HTTP 200** | Đã test đăng nhập dashboard |
| iOS Simulator | `dist/NinhVaNa-ios-simulator.zip` | **Đã build lại 26/10 09:25** | Mặc định mở URL `/login` mới |
| Android | `dist/NinhVaNa-0.1.0-android.apk` | **Đã build lại 26/10 09:24** | v0.1.0, mặc định `/login`, debug-signed |
| Desktop macOS | `dist/NinhVaNa-0.1.0-macos-arm64.dmg` | **Đã build lại 26/10 09:26** | Mặc định `/login`, chưa ký |
| Desktop Windows | `dist/NinhVaNa-0.1.0-windows-x64-setup.exe` | **Đã build lại 26/10 09:26** | Mặc định `/login`, chưa ký |
| Desktop Linux | `pnpm --filter @ninhvana/desktop start` | Chưa đóng gói | Dùng được khi có Node/Electron |
| iOS thiết bị thật | `dist/NinhVaNa-ios-unsigned.ipa` | Chưa ký | Cần Apple ID/team |

## Điểm quan trọng

- App native mở WebView trỏ tới URL Cloudflare; các tính năng web mới tự động có sau khi server cập nhật.
- Worker hiện proxy về tunnel trên Mac; tắt Mac là app dừng.
- Muốn 24/7 không Mac: deploy VPS (`docs/DEPLOY-VPS.md`) rồi đổi `ORIGIN_URL` của Worker.
- APK/iOS simulator/desktop đã được build lại với URL mặc định mới.
- iOS thiết bị thật cần Apple signing identity.
