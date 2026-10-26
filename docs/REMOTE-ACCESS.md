# Truy cập NinhVaNa từ iPhone (LAN và ngoài Wi-Fi)

## Vì sao iPhone cùng Wi-Fi vẫn không vào?

Máy Mac hiện tại:

```text
IP LAN: 192.168.1.27
Cổng web: 3000
Server bind: *:3000
Firewall macOS: tắt
Truy cập từ chính Mac qua LAN: HTTP 200
```

Như vậy server đã mở đúng. Trên iPhone **không được nhập `localhost`** — `localhost` là chính iPhone. Nhập:

```text
http://192.168.1.27:3000
```

Sau đó nhấn **Kết nối**. Nếu vẫn lỗi:

1. Kiểm tra iPhone và Mac đang ở **cùng một SSID chính**, không phải Wi-Fi Guest.
2. Tắt VPN/Private Relay trên iPhone.
3. Router có bật **AP/client isolation** → iPhone không gọi được Mac dù chung Wi-Fi.
4. Thử mở Safari trên iPhone: `http://192.168.1.27:3000/login`.
   - Safari mở được → app đang lưu URL cũ; sửa URL trong app.
   - Safari không mở được → lỗi router/AP isolation, dùng tunnel bên dưới.

## Cách khác: Cloudflare Worker (4G/5G/Wi-Fi khác)

URL test miễn phí:

```text
https://ninhvana.lenguyenduylinh29031992.workers.dev/login
```

Nhập URL này vào ô **Địa chỉ máy chủ** trong app iPhone, nhấn **Kết nối**. Không cần chung Wi-Fi; dùng được 4G/5G.

Hiện Worker proxy về tunnel của Mac, nên Mac + web + cloudflared vẫn phải chạy. URL Workers ổn định hơn quick tunnel cũ; đổi origin sang VPS để bỏ phụ thuộc Mac.

Khởi động lại tunnel:

```bash
bash scripts/start-tunnel.sh
```

Dừng tunnel:

```bash
pkill -f "cloudflared tunnel --url http://127.0.0.1:3000"
```

### Lưu ý bảo mật

Quick Tunnel là URL công khai, ai biết URL đều thấy trang đăng nhập. Hãy dừng tunnel khi không dùng. Để có tên miền cố định + kiểm soát truy cập, cần tài khoản Cloudflare (Named Tunnel) hoặc triển khai app lên VPS có HTTPS.

## Truy cập lâu dài

- **Cùng văn phòng:** dùng IP LAN cố định (đặt DHCP reservation cho Mac).
- **Ngoài văn phòng:** Cloudflare Named Tunnel + tên miền, hoặc VPS/Docker.
- **Không nên** mở cổng 3000 trực tiếp ra Internet.


## Tự động tìm máy chủ (mobile)

Launcher mới trong `apps/mobile/www` có nút **Tự động tìm**:
1. Thử địa chỉ đã lưu.
2. Thử máy chủ công khai (mặc định Cloudflare quick tunnel hoặc URL bạn cấu hình).
3. Thử `http://ninhvana.local:3000` (mDNS trong cùng Wi-Fi).

Nếu tìm thấy, app tự mở và lưu URL. Nếu không, app hiện gợi ý các địa chỉ đã thử. Nút này chỉ tìm các địa chỉ đã biết; nó không quét toàn bộ subnet Wi-Fi.

`ninhvana.local` cần bật mDNS trên Mac:
```bash
sudo scutil --set LocalHostName ninhvana
```
Tên này vẫn chỉ dùng trong cùng mạng Wi-Fi. Ngoài Wi-Fi phải dùng tên miền công khai.

## Không phụ thuộc Mac
Xem `docs/DEPLOY-VPS.md`. Bản chất IP LAN do Wi-Fi cấp và không thể truy cập từ ngoài; muốn dùng 4G/5G cần tên miền công khai (VPS hoặc tunnel có tên miền cố định).


## Offline
Xem `docs/OFFLINE-SYNC.md`: app đã có hàng đợi thao tác ghi và tự đồng bộ khi có mạng; để offline toàn bộ dữ liệu cần local-first database.
