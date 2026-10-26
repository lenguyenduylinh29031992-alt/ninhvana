# Cài đặt ứng dụng NinhVaNa

## Bộ cài đặt có sẵn

| Nền tảng | Tệp | Ghi chú |
|---|---|---|
| macOS Apple Silicon | `dist/NinhVaNa-0.1.0-macos-arm64.dmg` | Kéo app vào Applications |
| Windows 10/11 x64 | `dist/NinhVaNa-0.1.0-windows-x64-setup.exe` | Installer NSIS, chọn thư mục cài |
| Android | `dist/NinhVaNa-0.1.0-android.apk` | Debug-signed, cài trực tiếp |
| iOS / iPadOS | `dist/NinhVaNa-0.1.0-ios-source.zip` | Cần Xcode + Apple Developer để ký |

Mã kiểm tra: `dist/SHA256SUMS.txt`.

## Điều kiện chung

Ứng dụng là **client** kết nối tới máy chủ NinhVaNa. Máy chủ phải chạy trước:

```bash
cd "QLDN NINHVANA"
docker compose up -d --build
# hoặc local: pnpm dev
```

- Desktop mặc định mở `https://ninhvana.lenguyenduylinh29031992.workers.dev/login`.
- Lần đầu mở, nếu chưa kết nối được, app hiện màn hình **Kết nối máy chủ** để nhập địa chỉ.
- Đổi máy chủ về sau: menu **NinhVaNa → Đổi máy chủ…**.

## macOS

1. Mở `dist/NinhVaNa-0.1.0-macos-arm64.dmg`.
2. Kéo **NinhVaNa** vào **Applications**.
3. Mở app. Bản chưa ký Apple Developer nên lần đầu có thể bị chặn:
   - Chuột phải app → **Open** → **Open**, hoặc
   - `xattr -dr com.apple.quarantine /Applications/NinhVaNa.app`

Yêu cầu: macOS 12+, Apple Silicon (bản arm64). Kết nối `localhost:3000` khi Docker/local đang chạy trên cùng máy.

## Windows 10/11

1. Chạy `dist/NinhVaNa-0.1.0-windows-x64-setup.exe`.
2. Chọn **Install for me only** và thư mục cài.
3. Nếu SmartScreen cảnh báo: **More info → Run anyway** (bản demo chưa ký số).
4. Mở **NinhVaNa** từ Start Menu/Desktop.

Máy chủ có thể chạy trên chính máy Windows (`http://localhost:3000`) hoặc máy khác trong LAN (`http://192.168.1.20:3000`). Bản test dùng URL Cloudflare `/login`.

## Android

1. Chép `NinhVaNa-0.1.0-android.apk` sang điện thoại.
2. Cài đặt: cho phép **Install unknown apps** cho ứng dụng quản lý tệp/Chrome.
3. Mở **NinhVaNa**. Nhập địa chỉ máy chủ, ví dụ:
   - Cùng Wi-Fi với Mac/PC: `http://192.168.1.20:3000`
   - Máy chủ đã public: `https://ninhvana.lenguyenduylinh29031992.workers.dev`
4. Địa chỉ được lưu lại cho các lần sau.

Lưu ý: điện thoại và máy chủ phải cùng mạng, firewall mở cổng 3000; không dùng `localhost` trên điện thoại.

## iOS / iPadOS

Máy này **chưa tạo được .ipa cài trực tiếp** vì:
- Chưa có iOS platform runtime trong Xcode;
- Không có Apple Development certificate/team để ký.

Đã đóng gói dự án Capacitor iOS hoàn chỉnh:

```bash
unzip dist/NinhVaNa-0.1.0-ios-source.zip
cd apps/mobile
pnpm install
pnpm exec cap sync ios
cd ios/App && pod install
open App.xcworkspace
```

Trong Xcode: chọn **Team** của bạn, chọn iPhone, nhấn **Run**. Để phát hành: **Product → Archive → Distribute App** (TestFlight/App Store). Xem thêm `dist/NinhVaNa-ios-README.md`.

## Build lại từ mã nguồn

```bash
# Desktop
pnpm --filter @ninhvana/desktop dist:mac
pnpm --filter @ninhvana/desktop exec electron-builder --win nsis --x64

# Android (cần Android SDK + Java 21)
cd apps/mobile
pnpm exec cap sync android
cd android && ./gradlew assembleDebug
```

## Cấu trúc

- `apps/desktop` — Electron shell, menu, màn hình cấu hình máy chủ, `electron-builder`.
- `apps/mobile` — Capacitor Android/iOS + màn hình kết nối máy chủ.
- `dist/` — bộ cài đặt và checksum (không commit vào git).
