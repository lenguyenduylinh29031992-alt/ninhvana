import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) { try { process.loadEnvFile(path); } catch { /* ignore */ } }
}
const prisma = new PrismaClient();
const PREFIX = 'DEMO-TEST';
const GUESTS = [
  { code: 'DEMO-G01', firstName: 'Minh', lastName: 'Anh', email: 'demo.anh@ninhvana.test', phone: '+84 90 111 2001', country: 'Việt Nam' },
  { code: 'DEMO-G02', firstName: 'Thu', lastName: 'Hà', email: 'demo.ha@ninhvana.test', phone: '+84 90 111 2002', country: 'Việt Nam' },
  { code: 'DEMO-G03', firstName: 'Daniel', lastName: 'Lee', email: 'demo.lee@ninhvana.test', phone: '+65 8111 2003', country: 'Singapore' },
  { code: 'DEMO-G04', firstName: 'Sakura', lastName: 'Tanaka', email: 'demo.tanaka@ninhvana.test', phone: '+81 90 1111 2004', country: 'Nhật Bản' },
];
async function clear() {
  const property = await prisma.property.findFirstOrThrow({ where: { code: 'NVN' } });
  await prisma.housekeepingTask.deleteMany({ where: { propertyId: property.id, notes: { contains: PREFIX } } });
  await prisma.guestReview.deleteMany({ where: { propertyId: property.id, comment: { contains: PREFIX } } });
  await prisma.campaign.deleteMany({ where: { orgId: property.orgId, name: { startsWith: PREFIX } } });
  await prisma.expense.deleteMany({ where: { propertyId: property.id, number: { startsWith: PREFIX } } });
  await prisma.reservation.deleteMany({ where: { propertyId: property.id, code: { startsWith: PREFIX } } });
  await prisma.guest.deleteMany({ where: { orgId: property.orgId, code: { startsWith: 'DEMO-G' } } });
  console.info('✓ Đã xoá dữ liệu test (khách, đặt phòng, buồng phòng, đánh giá, chiến dịch, chi phí).');
}
async function seed() {
  await clear();
  const property = await prisma.property.findFirstOrThrow({ where: { code: 'NVN' } });
  const rooms = await prisma.room.findMany({ where: { propertyId: property.id }, include: { roomType: true }, orderBy: { number: 'asc' } });
  const ratePlan = await prisma.ratePlan.findFirst({ where: { propertyId: property.id, code: 'BAR' } });
  const admin = await prisma.user.findFirst({ where: { orgId: property.orgId, email: 'admin@ninhvana.vn' } });
  const guests = [];
  for (const guest of GUESTS) {
    guests.push(await prisma.guest.upsert({
      where: { orgId_code: { orgId: property.orgId, code: guest.code } },
      update: { ...guest, fullName: `${guest.firstName} ${guest.lastName}`, notes: PREFIX },
      create: { orgId: property.orgId, ...guest, fullName: `${guest.firstName} ${guest.lastName}`, nationality: guest.country, language: 'vi', notes: PREFIX, vipLevel: guest.code === 'DEMO-G03' ? 2 : 1 },
    }));
  }
  for (const [index, guest] of guests.entries()) {
    const room = rooms[index % rooms.length]!;
    const checkIn = new Date(`2026-11-${String(5 + index).padStart(2, '0')}T00:00:00Z`);
    const checkOut = new Date(`2026-11-${String(7 + index).padStart(2, '0')}T00:00:00Z`);
    const rate = Number(room.roomType.baseRate);
    await prisma.reservation.create({
      data: {
        propertyId: property.id, code: `${PREFIX}-RSV-${String(index + 1).padStart(2, '0')}`,
        status: index === 1 ? 'IN_HOUSE' : 'CONFIRMED', primaryGuestId: guest.id, ratePlanId: ratePlan?.id,
        checkIn, checkOut, nights: 2, adults: index === 3 ? 2 : 1, children: 0,
        totalNet: rate * 2, totalServiceCharge: rate * 2 * 0.05, totalTax: rate * 2 * 0.08,
        totalAmount: rate * 2 * 1.13, depositAmount: rate * 0.3, paidAmount: rate * 0.3, balance: rate * 2 * 1.13 - rate * 0.3,
        specialRequests: index === 2 ? 'Phòng view biển, tầng cao' : null,
        notes: `${PREFIX} · Dữ liệu trình diễn có thể xoá`,
        rooms: { create: { roomTypeId: room.roomTypeId, roomId: room.id, guestId: guest.id, checkIn, checkOut, adults: 1, nightlyRate: rate, totalNet: rate * 2, totalServiceCharge: rate * 2 * 0.05, totalTax: rate * 2 * 0.08, totalAmount: rate * 2 * 1.13 } },
      },
    });
    await prisma.guest.update({ where: { id: guest.id }, data: { totalStays: { increment: 1 }, totalNights: { increment: 2 }, lifetimeValue: { increment: rate * 2 } } });
  }
  for (const [index, room] of rooms.slice(0, 3).entries()) {
    await prisma.housekeepingTask.create({ data: { propertyId: property.id, roomId: room.id, type: index === 0 ? 'CLEAN' : index === 1 ? 'INSPECTION' : 'DEEP_CLEAN', status: index === 0 ? 'PENDING' : 'IN_PROGRESS', priority: 1, assignedToId: admin?.id, notes: `${PREFIX} · ${index === 0 ? 'Dọn phòng demo' : 'Kiểm tra phòng demo'}` } });
  }
  const reviews = [
    { rating: 5, title: 'Tuyệt vời', comment: `${PREFIX} · Phòng sạch, view biển rất đẹp.` },
    { rating: 4, title: 'Rất tốt', comment: `${PREFIX} · Nhân viên thân thiện, bữa sáng phong phú.` },
    { rating: 3, title: 'Cần cải thiện', comment: `${PREFIX} · Phòng yên tĩnh nhưng cần thêm ổ cắm.` },
  ];
  for (const [index, review] of reviews.entries()) await prisma.guestReview.create({ data: { orgId: property.orgId, propertyId: property.id, guestId: guests[index]!.id, rating: review.rating, cleanliness: review.rating, service: review.rating, location: 5, value: 4, title: review.title, comment: review.comment, status: 'NEW', reviewDate: new Date(`2026-10-${20 + index}T00:00:00Z`) } });
  for (const name of ['Chăm sóc khách đoàn tháng 11', 'Ưu đãi khách quay lại']) await prisma.campaign.create({ data: { orgId: property.orgId, name: `${PREFIX} · ${name}`, channel: 'EMAIL', segment: 'ALL', subject: name, body: `<p>${PREFIX} · Nội dung chiến dịch trình diễn.</p>`, status: 'DRAFT', createdById: admin?.id } });
  for (const [index, description] of ['Chi phí hoa tươi tiền sảnh', 'Chi phí kiểm tra chất lượng phòng'].entries()) await prisma.expense.create({ data: { orgId: property.orgId, propertyId: property.id, number: `${PREFIX}-EXP-${index + 1}`, accountCode: '6900', department: 'ADMIN', description: `${PREFIX} · ${description}`, amount: 450000, vatAmount: 0, total: 450000, status: 'APPROVED', expenseDate: new Date(`2026-10-${18 + index}T00:00:00Z`), paymentMethod: 'CASH', createdById: admin?.id } });
  console.info(`✓ Đã tạo ${guests.length} khách, 4 đặt phòng, 3 buồng phòng, 3 đánh giá, 2 chiến dịch, 2 chi phí demo. Xoá bằng --clear.`);
}
const clearMode = process.argv.includes('--clear');
(clearMode ? clear() : seed()).catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
