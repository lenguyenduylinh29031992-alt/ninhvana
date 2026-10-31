# VPS miễn phí — thực tế và cách đổi

## Có VPS miễn phí thật không?

Không có VPS 24/7 miễn phí **không cần tài khoản/thẻ xác minh**. Các lựa chọn:

| Nhà cung cấp | Miễn phí | Hạn chế |
|---|---|---|
| **Oracle Cloud Always Free** | 4 OCPU ARM / 24 GB RAM / 200 GB (theo vùng) | Cần tài khoản + thẻ xác minh; có thể hết capacity |
| Google Cloud e2-micro | Free tier | Cần billing account |
| AWS Free Tier | 12 tháng đầu | Sau đó tính phí |
| Render/Fly.io/Koyeb | Gói free | Web service ngủ, DB/Redis hạn chế, không hợp production |

**Khuyến nghị:** Oracle Cloud Always Free nếu muốn 0 đồng lâu dài.

## Không cần mua tên miền

Có thể dùng `sslip.io` miễn phí:

```text
<IP-VPS>.sslip.io
```

Ví dụ IP `140.238.1.2` → `140.238.1.2.sslip.io`. Caddy tự xin HTTPS.

Kiến trúc:

```text
workers.dev (miễn phí)
   → Cloudflare Worker
   → https://<IP>.sslip.io (VPS, Caddy)
   → Next/Nest/Postgres/Redis
```

## Các bước deploy (khi có VPS)

1. Tạo VM Ubuntu 24.04 ARM/AMD, mở cổng 80/443.
2. Cài Docker + Compose.
3. Copy source + `docker-compose.prod.yml`, `Caddyfile`, `.env.prod`.
4. Đặt:
   ```env
   APP_DOMAIN=<IP>.sslip.io
   ALLOWED_ORIGINS=https://<IP>.sslip.io,https://ninhvana-server.tail1116d8.ts.net
   ```
5. Chạy:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
   ```
6. Sửa `wrangler.toml`:
   ```toml
   ORIGIN_URL = "https://<IP>.sslip.io"
   ```
7. Deploy lại Worker:
   ```bash
   npx wrangler@latest deploy
   ```
8. Giữ nguyên link test:
   ```text
   https://ninhvana-server.tail1116d8.ts.net/login
   ```

## Việc tôi cần từ bạn

Tôi không thể tự tạo tài khoản Oracle/thẻ xác minh thay bạn. Để tôi deploy trực tiếp, cần:
- IP công khai VPS
- User SSH (thường `ubuntu`)
- SSH private key hoặc cách truy cập
- Quyền mở cổng 80/443

Sau đó tôi sẽ chạy migration, seed, cấu hình Caddy/Worker và kiểm tra link.

## Nếu chưa có VPS

Giữ nguyên bản test hiện tại; app chạy qua Mac tunnel. Không nên dùng quick tunnel cho khách hàng thật.
