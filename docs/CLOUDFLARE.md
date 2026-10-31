# Cloudflare Worker & tên miền

## Trạng thái hiện tại

Worker tên `ninhvana` đã được deploy:

```text
https://ninhvana-server.tail1116d8.ts.net
```

Đăng nhập admin đã kiểm tra thành công qua URL này.

Worker là **gateway**: nhận request tại tên miền Cloudflare rồi chuyển tới `ORIGIN_URL`.

```text
Trình duyệt → Cloudflare Worker → ORIGIN_URL (web/API)
```

## Kiến trúc quan trọng

Cloudflare Worker **không chạy được** NestJS + PostgreSQL + Redis trực tiếp. Vì vậy:

- Worker cung cấp tên miền/HTTPS.
- App NestJS/Next.js + DB vẫn phải chạy ở một origin (Mac tunnel hoặc VPS).
- Hiện `ORIGIN_URL` trỏ tới Cloudflare quick tunnel của Mac:
  - Dùng được ngay để test.
  - **Vẫn phụ thuộc Mac đang chạy** và URL tunnel có thể đổi sau khi cloudflared restart.
  - Khi tunnel đổi, chạy `bash scripts/start-tunnel.sh` rồi cập nhật `ORIGIN_URL` và `npx wrangler deploy`.
- Muốn không phụ thuộc Mac: deploy `docs/DEPLOY-VPS.md`, sau đó đổi `ORIGIN_URL` sang `https://app.ninhvana.vn` (hoặc IP VPS) và deploy lại Worker.

## Cấu hình

`wrangler.toml`:

```toml
name = "ninhvana"
main = "cloudflare/worker.js"
compatibility_date = "2026-10-26"

[vars]
ORIGIN_URL = "https://<quick-tunnel-hiện-tại>.trycloudflare.com"
```

Deploy:

```bash
npx wrangler@latest deploy
```

Cập nhật origin không cần sửa code:

```bash
npx wrangler@latest versions upload --var ORIGIN_URL:https://app.ninhvana.vn
# hoặc sửa wrangler.toml rồi deploy
```

## Tên miền riêng (không bắt buộc)

Bản test dùng tên miền miễn phí:
```text
https://ninhvana-server.tail1116d8.ts.net
```

Không cần mua tên miền. Nếu sau này muốn dùng `app.ninhvana.vn`:

1. Mua/đăng ký tên miền (Cloudflare Registrar hoặc nhà cung cấp khác).
2. Thêm domain vào Cloudflare, đổi nameserver theo hướng dẫn.
3. Vào **Workers & Pages → ninhvana → Settings → Domains & Routes → Add custom domain**.
4. Nhập `app.ninhvana.vn`; Cloudflare tự tạo DNS + chứng chỉ.
5. Thêm origin này vào `ALLOWED_ORIGINS` của API:
   ```env
   ALLOWED_ORIGINS=https://app.ninhvana.vn,https://ninhvana-server.tail1116d8.ts.net
   ```
6. Khởi động lại API.

Nếu chưa mua tên miền, dùng URL `workers.dev` ở trên để test.

## Bảo mật

- Worker chỉ proxy tới đúng `ORIGIN_URL`, không phải open proxy.
- Không đặt token/secret trong `wrangler.toml`.
- Nên đặt Cloudflare Access trước Worker nếu chỉ muốn nhân viên truy cập.
- Với production, dùng VPS + HTTPS, không dùng quick tunnel.
