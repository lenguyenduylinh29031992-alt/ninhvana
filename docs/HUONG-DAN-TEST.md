# Mở & kiểm thử NinhVaNa trên macOS, Windows, Android, iOS

## 0. Thông tin chung

| Mục | Giá trị |
|---|---|
| Giao diện | http://localhost:3000 |
| API / Swagger | http://localhost:4000/api/v1 · http://localhost:4000/api/docs |
| MailHog (email demo) | http://localhost:8025 |
| Mật khẩu demo | `NinhVaNa@2026` |
| Admin toàn quyền | `admin@ninhvana.vn` — Nguyễn Văn A |
| Tài khoản gợi ý | `ceo@ninhvana.vn` (Nguyễn Văn C), `manager.hanoi@ninhvana.vn` (Nguyễn Văn F), `cfo@ninhvana.vn` (Nguyễn Văn D) |

Trang login có nút **Tài khoản demo** để chọn nhanh 15 vai trò. Dữ liệu seed gồm 2 cơ sở, 250 phòng, 30 ngày vận hành chi tiết và 24 tháng lịch sử tài chính.

---

## 1. macOS

### Cách A — Docker (khuyến nghị)

Cài Docker Desktop, hoặc dùng Colima không cần GUI:

```bash
brew install docker docker-compose colima
colima start --cpu 4 --memory 6 --disk 40
cd "/Users/tt/Documents/deepseek-harness/QLDN NINHVANA"
docker-compose up -d --build
open http://localhost:3000
```

Nếu dùng Docker Desktop thì lệnh là `docker compose up -d --build`.

- Kiểm tra: `docker-compose ps` — 6 service phải `healthy`/`Up`.
- Log: `docker-compose logs -f api web`
- Dừng: `docker-compose down` (giữ DB) hoặc `docker-compose down -v` (xoá DB demo).

### Cách B — Chạy local

```bash
brew install node@22 pnpm postgresql@16 redis
pnpm install
pnpm setup          # tạo .env, PostgreSQL/Redis cục bộ trong .dev, migrate + seed
pnpm dev            # API :4000, Web :3000
```

`pnpm setup` dùng bash và Homebrew; nếu PostgreSQL hệ thống đã chiếm cổng, xem `.env.local` và `scripts/dev-db.sh`.

### Test trên macOS

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
bash scripts/check-acceptance.sh          # 39/39, app phải đang chạy
pnpm --filter @grand-suite/web exec node e2e/flows.mjs        # 5 luồng browser
pnpm --filter @grand-suite/web exec node e2e/screenshots.mjs  # ảnh 1920/768/390
```

---

## 2. Windows 10/11

### Cách A — Docker Desktop + WSL2 (khuyến nghị)

1. Bật **Virtualization** trong BIOS và cài **WSL2** (`wsl --install`), sau đó cài Docker Desktop và bật WSL2 backend.
2. Mở **PowerShell** tại thư mục dự án:

```powershell
cd "D:\duong-dan\QLDN NINHVANA"
docker compose up -d --build
Start-Process http://localhost:3000
```

Nếu máy chỉ có Compose standalone: `docker-compose up -d --build`.

- Kiểm tra: `docker compose ps`, log `docker compose logs -f api web`.
- Dừng: `docker compose down` hoặc `docker compose down -v`.

### Cách B — Chạy local trong WSL2/Ubuntu

```bash
sudo apt update && sudo apt install -y postgresql redis-server
corepack enable && corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm setup
pnpm dev
```

Mở `http://localhost:3000` bằng Chrome/Edge trên Windows (WSL2 forward cổng tự động). Chạy native PowerShell không có bash thì nên dùng Docker Desktop hoặc WSL2 vì `pnpm setup` là script bash.

### Test trên Windows

PowerShell:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter "@grand-suite/web" exec node e2e/flows.mjs
```

`scripts/check-acceptance.sh` cần **Git Bash** hoặc WSL:

```bash
bash scripts/check-acceptance.sh
```

---

## 3. Android (điện thoại, tablet, emulator)

### Điện thoại thật — cùng Wi-Fi với máy chủ

1. Tìm IP LAN của máy chạy Docker:
   - macOS: `ipconfig getifaddr en0`
   - Windows: `ipconfig` → dòng **IPv4 Address** (ví dụ `192.168.1.20`)
2. Mở Chrome trên Android: `http://192.168.1.20:3000`
3. Đăng nhập bằng tài khoản demo.

Nếu không truy cập được:

- Đảm bảo điện thoại và máy tính **cùng mạng Wi-Fi**, không bật “AP isolation” trên router.
- Cho phép cổng **3000** và **4000** trong firewall macOS/Windows.
- Dùng đúng IP LAN, **không** dùng `localhost` trên điện thoại.
- `PUBLIC_WEB_URL` trong `.env` nên đặt `http://192.168.1.20:3000` rồi `docker compose up -d api` để CORS/WS đúng.
- Realtime dùng WebSocket tới `http://192.168.1.20:4000`; nếu công ty chặn cổng 4000, dùng HTTPS tunnel.

### Android emulator

- Android Studio emulator truy cập máy host qua `http://10.0.2.2:3000`.

### Cài như ứng dụng (PWA)

Chrome → menu **⋮** → **Add to Home screen**. Trên Android, service worker/offline chỉ hoạt động trong **secure context** (HTTPS hoặc localhost). Với điện thoại thật qua LAN HTTP, app vẫn dùng được nhưng offline/PWA cache không kích hoạt; muốn test offline hãy dùng HTTPS tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
# hoặc: ngrok http 3000
```

Mở URL HTTPS trên điện thoại rồi Add to Home screen.

### Test trên Android

- Kiểm tra 390 px: login → dashboard → lễ tân → POS → buồng phòng (bàn phím cảm ứng, không hover).
- Test nhanh: đặt phòng tại `/front-desk`, thêm món tại `/pos`, cập nhật trạng thái tại `/housekeeping`.

---

## 4. iOS / iPadOS

### iPhone/iPad thật — cùng Wi-Fi

1. Tìm IP LAN như phần Android.
2. Mở **Safari**: `http://192.168.1.20:3000`.
3. Chia sẻ → **Add to Home Screen** để chạy toàn màn hình.

Lưu ý iOS:

- Safari yêu cầu **HTTPS** cho service worker/PWA offline trên tên miền thật; LAN HTTP chỉ dùng online bình thường.
- Nếu cần offline/notifications, dùng HTTPS tunnel (`cloudflared`/`ngrok`) như Android.
- Cho phép cookie trong Safari (Settings → Safari → Advanced → Website Data); đăng nhập dùng cookie first-party qua proxy Next nên không cần bật cross-site.
- Camera/microphone chỉ dùng khi có HTTPS và được cấp quyền.

### iOS Simulator

- Mở `http://localhost:3000` trực tiếp trong Safari của simulator (dùng chung network với macOS).

### Test trên iOS

- Kiểm tra 390 px ở Safari, landscape iPad 768/1024.
- Test PWA: Add to Home Screen, mở lại, kiểm tra offline fallback (khi dùng HTTPS).
- Test form đặt phòng, POS, night audit; kiểm tra bàn phím che input.

---

## 5. Bộ test tự động (mọi hệ điều hành)

| Lệnh | Ý nghĩa |
|---|---|
| `pnpm lint` | ESLint toàn monorepo |
| `pnpm typecheck` | TypeScript API/Web/Shared |
| `pnpm test` | 82 unit shared + 38 integration API |
| `pnpm build` | Build production toàn bộ |
| `pnpm --filter @grand-suite/shared test:coverage` | Coverage shared (≥70%) |
| `pnpm --filter @grand-suite/api exec vitest run --coverage` | Coverage lõi API (≥70%) |
| `bash scripts/check-acceptance.sh` | 39 kiểm tra nghiệm thu (cần app chạy) |
| `pnpm --filter @grand-suite/web exec node e2e/flows.mjs` | 5 luồng browser e2e |
| `pnpm --filter @grand-suite/web exec node e2e/screenshots.mjs` | Ảnh 1920/768/390 + dark mode |

Yêu cầu cho acceptance/e2e: web `:3000` và API `:4000` đang chạy, tài khoản seed còn hiệu lực.

---

## 6. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| `port is already allocated` | Tắt app local đang chiếm 3000/4000: `lsof -i :3000` (macOS) hoặc `netstat -ano \| findstr :3000` (Windows) |
| `docker compose` không có | Dùng `docker-compose`, hoặc cập nhật Docker Desktop |
| Web trắng sau khi rebuild | Hard refresh (Cmd/Ctrl+Shift+R); DevTools → Application → Unregister service worker |
| Điện thoại không vào được | Cùng Wi-Fi, đúng IP LAN, mở firewall 3000/4000, tắt AP isolation |
| Realtime không chạy trên LAN | Đặt `PUBLIC_WEB_URL=http://IP:3000`, mở cổng 4000; hoặc dùng HTTPS tunnel |
| PWA offline không chạy trên LAN | Service worker cần HTTPS (trừ localhost); dùng `cloudflared`/`ngrok` |
| Quên dữ liệu demo | `docker compose down -v && docker compose up -d --build` |

---

## 7. Đổi màu thương hiệu

Bảng màu hiện tại: **trắng kem + xanh dương biển**. Token nằm tại `apps/web/src/app/globals.css`:

```css
--canvas: 40 40% 97%;       /* nền kem */
--brand: 203 72% 30%;       /* xanh biển chính (nút, link, badge) */
--brand-soft: 202 55% 92%;  /* nền xanh nhạt */
--ink: 210 45% 12%;         /* chữ xanh đen */
--sidebar: 210 55% 9%;      /* sidebar navy */
```

Sau khi sửa:

```bash
pnpm --filter @grand-suite/web build
# Docker:
docker-compose build web && docker-compose up -d web
```

Nhớ hard refresh để xoá cache CSS/service worker.
