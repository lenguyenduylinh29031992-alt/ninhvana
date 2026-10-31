# URL miễn phí qua GitHub Pages

GitHub Pages **không chạy được** Next.js + NestJS + PostgreSQL. Vì vậy trang GitHub Pages chỉ là cửa ngõ chuyển hướng tới app thật trên Cloudflare Worker.

## URL sau khi bật Pages
```text
https://lenguyenduylinh29031992-alt.github.io/ninhvana/
```
Trang này tự chuyển tới:
```text
https://ninhvana-server.tail1116d8.ts.net/
```

## Bật Pages
1. Push repo lên GitHub.
2. Repository → **Settings → Pages**.
3. Source: **Deploy from a branch**.
4. Branch: `main`, thư mục: `/docs`.
5. Save; đợi GitHub Pages build.

File chuyển hướng: `docs/index.html`; `docs/.nojekyll` để GitHub không xử lý Jekyll.

## Lưu ý
- Đây là URL test miễn phí, không phải tên miền riêng.
- App thật vẫn ở `workers.dev`; backend hiện là Mac/tunnel.
- Muốn app chạy khi tắt Mac phải deploy VPS và đổi `ORIGIN_URL`.
