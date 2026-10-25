#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
mkdir -p dist
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @ninhvana/desktop dist:mac
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @ninhvana/desktop exec electron-builder --win nsis --x64
cp apps/desktop/release/NinhVaNa-0.1.0-arm64.dmg dist/NinhVaNa-0.1.0-macos-arm64.dmg
cp "apps/desktop/release/NinhVaNa Setup 0.1.0.exe" dist/NinhVaNa-0.1.0-windows-x64-setup.exe
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}"
( cd apps/mobile && pnpm exec cap sync android && cd android && ./gradlew assembleDebug )
cp apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk dist/NinhVaNa-0.1.0-android.apk
( cd dist && shasum -a 256 *.dmg *.exe *.apk > SHA256SUMS.txt )
echo "Artifacts in $ROOT/dist"
