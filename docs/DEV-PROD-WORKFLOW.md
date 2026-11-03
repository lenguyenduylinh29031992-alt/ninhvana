# Mac dev/staging và Ubuntu production

## Mục tiêu

- Mac luôn có một server riêng để chạy/test khi Ubuntu tắt.
- Source code đi từ Mac → Git → Ubuntu.
- SQL của Mac và Ubuntu **độc lập**, không copy/ghi đè lẫn nhau.
- Deploy code không reset, seed, restore hoặc xoá database production.

## Hai môi trường

| | Mac dev | Ubuntu production |
|---|---|---|
| Source | working tree | Git tag đã deploy |
| Web | `http://localhost:3000` | Funnel/Tailscale URL |
| API | `http://localhost:4000` | Caddy → API |
| PostgreSQL | `.dev/pgdata`, port `55432` | Docker volume `pgdata` |
| Redis | local `56379` | Docker Redis |
| Dữ liệu | dữ liệu dev/test | dữ liệu vận hành |
| Public | Không | Chỉ URL production |

Hai database **không replication**. Ghi ở Mac không tự sang Ubuntu và ngược lại.

## Chạy Mac

```bash
cd "/Users/tt/Documents/deepseek-harness/QLDN NINHVANA"
pnpm dev:mac
```

Script sẽ:

1. Khởi động PostgreSQL/Redis local trong `.dev/`.
2. Build shared package nếu cần.
3. Chạy API và web local.
4. Không mở tunnel, không deploy Worker, không đụng production.

Mở:

```text
http://localhost:3000
```

Nếu Mac và điện thoại cùng Tailscale, có thể mở:

```text
http://<Mac-Tailscale-IP>:3000
```

Cần thêm origin đó vào `ALLOWED_ORIGINS` trong `.env.local` nếu trình duyệt gọi API trực tiếp.

### Dừng Mac

```text
Ctrl+C
```

Dừng database local:

```bash
pnpm db:stop
```

Không chạy `pnpm db:reset` nếu muốn giữ dữ liệu test.

## Deploy code lên Ubuntu

Điều kiện:

- Working tree sạch.
- Đã cấu hình SSH key vào Ubuntu.
- Đã biết IP/Tailscale IP production.

Chạy:

```bash
NINHVANA_DEPLOY_CONFIRM=1 \
NINHVANA_PROD_HOST=<IP-Ubuntu> \
NINHVANA_SSH_KEY=$HOME/.ssh/ninhvana-oracle.key \
pnpm deploy:prod
```

Script sẽ:

1. Chạy lint, typecheck, test trên Mac.
2. Tạo Git tag `deploy-...` và push.
3. SSH vào Ubuntu.
4. Dump database production vào `backups/pre-<tag>.dump` (quyền 600).
5. `git reset --hard <tag>` — chỉ source code.
6. `docker compose up -d --build`.
7. API entrypoint chạy `prisma migrate deploy` (additive migration).
8. Health check web/API.

Script **không** chạy:

```text
prisma db push
prisma migrate reset
seed
pg_restore
DROP DATABASE
```

## Rollback

### Rollback code

Trên Ubuntu:

```bash
cd /opt/ninhvana
git fetch --tags
git checkout <tag-cũ>
docker compose up -d --build
```

### Rollback dữ liệu

Chỉ khi migration thực sự làm hỏng dữ liệu và đã được phê duyệt:

```bash
cd /opt/ninhvana
docker compose stop api web
docker compose exec -T db pg_restore \
  -U grandsuite -d grandsuite \
  --clean --if-exists --no-owner --no-privileges \
  backups/pre-<tag>.dump
docker compose start api web
```

Restore là thao tác phá huỷ dữ liệu hiện tại; phải backup trước.

## Quy tắc migration

- Chỉ dùng migration additive.
- Không sửa migration đã chạy trên production.
- Trước migration lớn: backup + snapshot VM.
- Không seed production.
- Không `prisma db push` lên production.
- Không copy database Mac đè database Ubuntu.

## Nếu cần dữ liệu production để test trên Mac

Không kết nối Mac vào DB production.

Tạo bản dump riêng, làm sạch PII, rồi restore vào database Mac **có tên riêng**:

```bash
# Trên Ubuntu: tạo dump
docker compose exec -T db pg_dump -U grandsuite -d grandsuite -Fc > /tmp/prod.dump

# Trên Mac: chỉ restore vào database dev riêng, không phải grandsuite production
createdb -h 127.0.0.1 -p 55432 -U grandsuite ninhvana_sandbox
pg_restore -h 127.0.0.1 -p 55432 -U grandsuite -d ninhvana_sandbox prod.dump
```

Sau đó đổi `DATABASE_URL` local sang `ninhvana_sandbox` nếu cần.

## Không dùng Mac làm public production

Đã vô hiệu hoá script tunnel/watchdog cũ theo mặc định. Muốn dùng legacy phải đặt rõ:

```bash
NINHVANA_ALLOW_LEGACY_PUBLIC=1
```

Không bật khi production đang chạy, vì có thể trỏ Worker về Mac và làm tách dữ liệu.

## Desktop/mobile

- Desktop/mobile có màn hình đổi máy chủ.
- Mac test dùng URL local/Tailscale của Mac.
- Production dùng URL Funnel production.
- Không nhập dữ liệu thật vào bản Mac nếu không có kế hoạch chuyển dữ liệu riêng.
