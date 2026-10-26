/**
 * Cloudflare gateway for NinhVaNa.
 *
 * The NestJS API and PostgreSQL cannot run inside a Worker. This Worker gives
 * the app a Cloudflare hostname and proxies all HTTP/WebSocket traffic to the
 * configured origin (currently the Mac tunnel; switch ORIGIN_URL to a VPS).
 */
export default {
  async fetch(request, env) {
    const origin = new URL(env.ORIGIN_URL);
    const incoming = new URL(request.url);
    const target = new URL(request.url);
    target.protocol = origin.protocol;
    target.host = origin.host;

    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', incoming.host);
    headers.set('x-forwarded-proto', incoming.protocol.replace(':', ''));
    headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');

    const isWebSocket = request.headers.get('upgrade')?.toLowerCase() === 'websocket';
    let upstream;
    try {
      upstream = await fetch(new Request(target.toString(), {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
      }));
    } catch {
      return maintenance(incoming.host);
    }

    if (isWebSocket) return upstream;
    if (upstream.status >= 500) return maintenance(incoming.host, upstream.status);

    const responseHeaders = new Headers(upstream.headers);
    const location = responseHeaders.get('location');
    if (location) {
      try {
        const next = new URL(location, origin);
        if (next.host === origin.host) {
          next.protocol = incoming.protocol;
          next.host = incoming.host;
          responseHeaders.set('location', next.toString());
        }
      } catch { /* keep upstream location */ }
    }
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  },
};

function maintenance(host, status = 503) {
  return new Response(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NinhVaNa — Bảo trì</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf7f2;color:#102a3c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(440px,90vw);background:#0b2239;color:#f7f3eb;border-radius:20px;overflow:hidden;box-shadow:0 24px 70px rgba(11,34,57,.25)}.head{padding:26px}.eyebrow{font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#b7c6cf}.head h1{font-family:Georgia,serif;font-weight:500;font-size:30px;margin:8px 0 6px}.head p{font-size:12px;line-height:1.6;color:#c7d1d6;margin:0}.body{background:#fffdf9;color:#102a3c;padding:20px}.clock{border:1px solid #e4dccf;border-radius:10px;padding:12px 14px}.clock span{display:block;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#7a878f}.clock strong{display:block;margin-top:4px;font-family:ui-monospace,Menlo,monospace;font-size:24px;letter-spacing:.1em}.body p{font-size:11px;color:#65737c;line-height:1.6}.body a{display:block;margin-top:14px;padding:11px;border-radius:9px;background:#1f6699;color:#fff;text-align:center;text-decoration:none;font-size:12px}</style></head><body><main class="card"><div class="head"><div class="eyebrow">NinhVaNa · ${host}</div><h1>Hệ thống đang bảo trì</h1><p>Không thể kết nối tới máy chủ gốc. Đội kỹ thuật đang kiểm tra.</p></div><div class="body"><div class="clock"><span>Thời gian chạy</span><strong id="elapsed">00:00:00</strong></div><p>Trang sẽ tự thử lại khi máy chủ hoạt động.</p><a href="">Thử lại ngay</a></div></main><script>const start=Date.now();setInterval(()=>{const s=Math.floor((Date.now()-start)/1000);const h=String(Math.floor(s/3600)).padStart(2,'0'),m=String(Math.floor(s%3600/60)).padStart(2,'0'),x=String(s%60).padStart(2,'0');document.getElementById('elapsed').textContent=h+':'+m+':'+x},1000);</script></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
