# Dữ liệu thử có thể xoá

Dữ liệu demo được đánh dấu bằng tiền tố `DEMO-TEST` / `DEMO-G`, chỉ dùng để kiểm tra giao diện và luồng nghiệp vụ. Không bao gồm POS.

## Tạo dữ liệu thử

```bash
cd "/Users/tt/Documents/deepseek-harness/QLDN NINHVANA"
pnpm --filter @grand-suite/api exec tsx prisma/demo-test-data.ts
```

Tạo:
- 4 khách hàng demo
- 4 đặt phòng (CONFIRMED/IN_HOUSE)
- 3 công việc buồng phòng
- 3 đánh giá khách
- 2 chiến dịch CRM
- 2 chi phí

Script chạy lại sẽ xoá bản demo cũ trước khi tạo mới (idempotent).

## Xoá dữ liệu thử

```bash
pnpm --filter @grand-suite/api exec tsx prisma/demo-test-data.ts --clear
```

Chỉ xoá các bản ghi có marker demo; không ảnh hưởng tài khoản, cấu hình, phòng, marketing, lương thật hoặc dữ liệu POS.

## Phạm vi kiểm tra

| Khu vực | Dữ liệu |
|---|---|
| Khách hàng | 4 hồ sơ |
| Đặt phòng | 4 reservation + room assignment |
| Buồng phòng | 3 task |
| CRM | 3 review + 2 campaign |
| Chi phí | 2 expense |
| POS | Không tạo (theo yêu cầu) |
