# iOS: runtime, build và signing

## Trạng thái máy này

- Xcode 26.6 đã cài, có iOS SDK 26.5.
- iOS Simulator runtime 26.5 đang được cài bằng:
  ```bash
  xcodebuild -downloadPlatform iOS
  ```
  Dung lượng cần khoảng 8,5 GB; quá trình tải có thể mất 30–90 phút tùy mạng.
- **iOS Simulator runtime 26.5 đã cài thành công**; app đã build, cài và chạy trên iPhone 17 Pro Simulator (xem `docs/evidence/ios-simulator-launcher.png`).
- **Build thiết bị thật (unsigned) đã thành công**: `dist/NinhVaNa-ios-unsigned.ipa`; file này cần được ký bằng Apple ID/team trước khi cài lên iPhone.
- Chưa có **Apple signing identity**:
  - `security find-identity -v -p codesigning` → 0 identity.
  - Xcode chưa có Apple ID/team (kiểm tra `defaults read com.apple.dt.Xcode DVTDeveloperAccountManagerAppleIDLists` → danh sách rỗng).
  - Không thể tạo chứng chỉ Apple Development thay bạn nếu không đăng nhập Apple Developer Account.

## Chạy Simulator (đã kiểm chứng)

```bash
cd apps/mobile
pnpm exec cap sync ios
cd ios/App && pod install
xcodebuild -workspace App.xcworkspace -scheme App \
  -sdk iphonesimulator -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  build
```

Mở Simulator bằng Xcode hoặc `xcrun simctl boot "iPhone 17 Pro"`, sau đó chạy app từ Xcode.

App đã đóng gói sẵn tại `dist/NinhVaNa-ios-simulator.zip`:

```bash
xcrun simctl boot "iPhone 17 Pro"
open -a Simulator
xcrun simctl install booted /path/to/App.app
xcrun simctl launch booted vn.ninhvana.app
```

## Thêm Apple signing identity (bạn phải thực hiện)

1. Mở **Xcode → Settings → Accounts**.
2. Nhấn **+ → Apple ID**, đăng nhập Apple ID (miễn phí cũng được cho thiết bị cá nhân).
3. Chọn project **App → Signing & Capabilities**:
   - Team: chọn team vừa thêm.
   - Bundle Identifier: `vn.ninhvana.app` (đổi nếu trùng).
   - Bật **Automatically manage signing**.
4. Cắm iPhone, chọn thiết bị và nhấn **Run**. Xcode sẽ tạo Apple Development certificate + provisioning profile.
5. Để phát hành TestFlight/App Store cần **Apple Developer Program** (trả phí) và quyền truy cập App Store Connect.

Không nên tạo chứng chỉ self-signed: thiết bị iOS sẽ không tin cậy và không cài được.

## Kết quả kiểm tra lệnh

```text
xcrun simctl list runtimes
→ iOS 26.5 (26.5 - 23F77) — installed

xcodebuild ... -sdk iphonesimulator ... CODE_SIGNING_ALLOWED=NO build
→ BUILD SUCCEEDED

xcodebuild ... -sdk iphoneos -destination generic/platform=iOS ... CODE_SIGNING_ALLOWED=NO build
→ BUILD SUCCEEDED

security find-identity -v -p codesigning
→ 0 valid identities found
```

Vì chưa có Apple ID/team, **không thể tạo Apple Development certificate** hoặc cài lên iPhone thật. Sau khi đăng nhập Xcode, chạy lại build không có `CODE_SIGNING_ALLOWED=NO` để Xcode tự ký.

## Nếu chỉ cần chạy trên Simulator

Simulator không cần Apple signing identity. Sau khi runtime cài xong, có thể build và chạy app ngay, không cần tài khoản Developer.
