# Marketing TikTok — nhân sự & chấm công

Nguồn dữ liệu (Google Sheets do quản trị viên cung cấp):

- [Chấm công & lịch nghỉ tháng 10/2026](https://docs.google.com/spreadsheets/d/1jb5s3KvVwZJyDqTr4_QZI7gUeKJS9WAyM_9jz6blBLE/edit?gid=536156494#gid=536156494)
- [Bảng lương thực lãnh + tạm ứng tháng 10/2026](https://docs.google.com/spreadsheets/d/1bBYbKMhKxJkMJxVV2boIrO4lPYnCHrC-RKTiMWpppVE/edit?gid=0#gid=0)
- [Chi phí đi chợ team TikTok tháng 11/2026](https://docs.google.com/spreadsheets/d/15H1_7oQ28ejuHiIOXlmZeeZDpN02eajQGLynmPhxjM4/edit?gid=1350094361#gid=1350094361)

## Dữ liệu đã nạp

| Mã | Họ tên | Công thực tế | Tạm ứng | Thực lãnh 10/2026 |
|---|---|---:|---:|---:|
| NV01 | Thảo Như | 19 | 1.600.000 đ | 2.974.074 đ |
| NV02 | Tấn Việt | 21 | 1.500.000 đ | 3.555.556 đ |
| NV03 | Mỹ Uyên | 17 | 0 đ | 4.092.593 đ |

- Bộ phận: **Marketing TikTok** (mã `TIKTOK`, nhóm SALES).
- 69 bản ghi chấm công ngày 01–25/10/2026.
- Kỳ lương `2026-10` ở trạng thái DRAFT, có cột tạm ứng.
- Trang `/hr` hiển thị đội Marketing TikTok, bảng công tháng 10, tạm ứng/thực lãnh và link 3 Google Sheet.

## Đồng bộ lại

```bash
cd apps/api
pnpm exec tsx prisma/import-marketing-sheets.ts
```

Script idempotent: nhân sự và chấm công được upsert; kỳ lương `2026-10` được dựng lại. Dữ liệu ngày được chụp tại thời điểm 25/10/2026; các ngày 26–31 chưa có trong sheet nên chưa nhập.
