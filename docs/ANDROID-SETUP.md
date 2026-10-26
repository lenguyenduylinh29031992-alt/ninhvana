# Build & chạy Android

## Cài SDK

```bash
brew install --cask android-commandlinetools
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

`apps/mobile/android/local.properties`:

```properties
sdk.dir=/opt/homebrew/share/android-commandlinetools
```

## Build APK

```bash
cd apps/mobile
pnpm exec cap sync android
pnpm run build:android
```

APK debug:
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

Bản phát hành trong repo: `dist/NinhVaNa-0.1.0-android.apk`.

## Cài lên máy

```bash
adb install -r dist/NinhVaNa-0.1.0-android.apk
```

APK hiện dùng **debug signing**, phù hợp cài thử. Khi phát hành Google Play cần tạo keystore release và cấu hình `signingConfigs`.

## Kiểm tra

- Package: `vn.ninhvana.app`
- Version: `0.1.0`
- minSdk 23 / targetSdk 35
- Quyền: INTERNET
- Đã kiểm tra bằng `aapt dump badging` và `apksigner verify`.
