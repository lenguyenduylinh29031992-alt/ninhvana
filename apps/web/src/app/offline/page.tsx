export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="max-w-md text-center">
        <p className="label-xs">Ngoại tuyến</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Kết nối đã gián đoạn</h1>
        <p className="mt-3 text-sm text-muted-foreground">Grand Suite đã lưu giao diện. Các thao tác POS và buồng phòng sẽ đồng bộ khi có mạng trở lại.</p>
        <a href="/dashboard" className="mt-5 inline-block rounded-full bg-ink px-5 py-2 text-xs text-surface">Thử lại</a>
      </div>
    </main>
  );
}
