# Tự phục hồi tunnel và máy chủ

Quick tunnel Cloudflare bị Cloudflare xoá sau một khoảng thời gian, không thể reconnect. Vì vậy có watchdog chạy trong một `screen` session:

```bash
screen -dmS ninhvana-watchdog bash -lc 'cd "/Users/tt/Documents/deepseek-harness/QLDN NINHVANA" && exec bash scripts/watchdog.sh'
```

## Watchdog làm gì

- Kiểm tra PostgreSQL/Redis, API, web mỗi 30 giây.
- Kiểm tra URL tunnel hiện tại; nếu không trả 200:
  - Tắt cloudflared cũ
  - Tạo quick tunnel mới với `--protocol http2`
  - Cập nhật `ORIGIN_URL` và deploy Worker
- Ghi log tại `.dev/watchdog.log`.

## Kiểm tra

```bash
screen -ls
tail -20 .dev/watchdog.log
curl -I https://ninhvana.lenguyenduylinh29031992.workers.dev/login
```

## Lưu ý

- Screen session mất khi Mac reboot; chạy lại lệnh trên.
- Quick tunnel vẫn đổi URL mỗi lần restart; watchdog tự cập nhật Worker.
- Giải pháp lâu dài: VPS hoặc Tailscale Funnel.
