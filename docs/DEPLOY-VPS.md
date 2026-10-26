# Triển khai 24/7 trên VPS (không cần Mac)

Mục tiêu: một tên miền cố định `https://app.ninhvana.vn` dùng được 4G/5G, máy Mac chỉ cần cho việc phát triển.

## 1. Chuẩn bị
- VPS Linux 2–4 GB RAM (Ubuntu 22.04/24.04), mở cổng 80/443.
- Tên miền + bản ghi DNS:
  - `A app.ninhvana.vn → IP VPS`
  - `AAAA` nếu VPS có IPv6.
- Cài Docker Engine + Compose plugin trên VPS.
- Copy source (hoặc clone repo) vào `/opt/ninhvana`, gồm:
  `docker-compose.prod.yml`, `Caddyfile`, `docker/`, `.env.prod`.

## 2. Cấu hình
```bash
cd /opt/ninhvana
cp .env.prod.example .env.prod
# sửa APP_DOMAIN, mật khẩu DB, JWT/COOKIE/CSRF secrets, APP_ENCRYPTION_KEY
chmod 600 .env.prod
```

Tạo khóa:
```bash
openssl rand -base64 32   # dùng cho các secret
openssl rand -base64 32   # APP_ENCRYPTION_KEY
```

## 3. Khởi động
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
```

Caddy tự xin chứng chỉ HTTPS. Kiểm tra:
```bash
curl -I https://app.ninhvana.vn
curl https://app.ninhvana.vn/api/v1/health
```

## 4. Tạo dữ liệu lần đầu
Production tắt seed tự động để tránh tạo dữ liệu demo. Chạy một lần:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  ./node_modules/.bin/tsx prisma/seed.ts
```
Sau đó đổi mật khẩu admin và cấu hình SMTP.

## 5. Cập nhật phiên bản
```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Migration chạy tự động trong API entrypoint; backup chạy hằng ngày.

## 6. Sao lưu
- Volume `backups` chứa dump PostgreSQL.
- Định kỳ copy volume/backup ra ngoài VPS (S3, NAS…).
- Không mở cổng 5432/6379 ra Internet.

## 7. Không dùng Mac làm máy chủ nữa
Sau khi VPS chạy ổn:
1. Trỏ DNS về VPS.
2. Cấu hình app mobile/desktop dùng `https://app.ninhvana.vn`.
3. Tắt Cloudflare quick tunnel trên Mac.
4. Có thể tắt máy Mac; dữ liệu nằm trên VPS.

## Phương án khác
- **Cloudflare Named Tunnel**: URL cố định nhưng vẫn phụ thuộc Mac đang chạy.
- **Tailscale/ZeroTier**: không cần cùng Wi-Fi nhưng phải cài VPN trên từng thiết bị; máy chủ vẫn phải chạy.
- **Static IP + port forwarding**: chỉ nên dùng nếu ISP cấp IP tĩnh, có firewall/TLS; rủi ro bảo mật cao hơn VPS.
