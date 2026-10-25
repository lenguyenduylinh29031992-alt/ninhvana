import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) { try { process.loadEnvFile(path); } catch { /* ignore */ } }
}
const prisma = new PrismaClient();
const TYPES = [
  { code: 'DORM-A1', name: 'Dormitory A1 — giường tầng', nameEn: 'A1 Bunk Dormitory', baseRate: 850_000, sizeSqm: 28, bedType: 'Bunk beds', maxAdults: 6, maxChildren: 0, count: 6, floor: 1, prefix: 'A1', start: 1 },
  { code: 'DORM-A2', name: 'Dormitory A2 — giường tầng', nameEn: 'A2 Bunk Dormitory', baseRate: 950_000, sizeSqm: 30, bedType: 'Bunk beds', maxAdults: 6, maxChildren: 0, count: 6, floor: 2, prefix: 'A2', start: 1 },
  { code: 'VIEW-A2', name: 'Phòng View trước A2', nameEn: 'A2 Front View Room', baseRate: 2_200_000, sizeSqm: 32, bedType: 'King', maxAdults: 2, maxChildren: 1, count: 2, floor: 2, prefix: 'A2', start: 7 },
  { code: 'CONNECT-A2', name: 'Connecting Room A2', nameEn: 'A2 Connecting Room', baseRate: 3_200_000, sizeSqm: 46, bedType: 'King + Twin', maxAdults: 4, maxChildren: 1, count: 1, floor: 2, prefix: 'A2', start: 9 },
  { code: 'DOUBLE-A3', name: 'Phòng đôi A3', nameEn: 'A3 Double Room', baseRate: 2_200_000, sizeSqm: 34, bedType: 'King', maxAdults: 2, maxChildren: 1, count: 10, floor: 3, prefix: 'A3', start: 1 },
  { code: 'FAMILY-A3', name: 'Phòng gia đình gác lửng A3', nameEn: 'A3 Family Mezzanine', baseRate: 3_500_000, sizeSqm: 55, bedType: 'King + 2 Twin', maxAdults: 4, maxChildren: 2, count: 2, floor: 3, prefix: 'A3', start: 11 },
];
async function main() {
  const property = await prisma.property.findFirstOrThrow({ where: { code: 'NVN' } });
  await prisma.$transaction(async (tx) => {
    await tx.ratePlanRate.deleteMany({ where: { roomType: { propertyId: property.id } } });
    await tx.room.deleteMany({ where: { propertyId: property.id } });
    await tx.roomTypeAmenity.deleteMany({ where: { roomType: { propertyId: property.id } } });
    await tx.roomType.deleteMany({ where: { propertyId: property.id } });
    await tx.floor.deleteMany({ where: { propertyId: property.id } });
    const floors = new Map<number, string>();
    for (const [index, name] of ['A1 — Tầng trệt', 'A2 — Tầng 2', 'A3 — Tầng 3'].entries()) {
      const floor = await tx.floor.create({ data: { propertyId: property.id, number: index + 1, name, sortOrder: index + 1 } });
      floors.set(index + 1, floor.id);
    }
    let ordinal = 0;
    for (const definition of TYPES) {
      const roomType = await tx.roomType.create({ data: {
        propertyId: property.id, code: definition.code, name: definition.name, nameEn: definition.nameEn,
        description: `${definition.sizeSqm}m² · ${definition.bedType} · tối đa ${definition.maxAdults} khách`,
        sizeSqm: definition.sizeSqm, bedType: definition.bedType, maxAdults: definition.maxAdults,
        maxChildren: definition.maxChildren, maxOccupancy: definition.maxAdults + definition.maxChildren,
        baseRate: definition.baseRate, extraAdultRate: 450_000, extraChildRate: 250_000, sortOrder: ordinal,
      } });
      const rooms = Array.from({ length: definition.count }, (_, index) => {
        ordinal += 1;
        const position = String(definition.start + index).padStart(2, '0');
        return {
          propertyId: property.id, roomTypeId: roomType.id, floorId: floors.get(definition.floor)!,
          number: `${definition.prefix}-${position}`,
          view: definition.code === 'VIEW-A2' ? 'View biển phía trước' : definition.code === 'DORM-A1' ? 'View hồ bơi' : null,
          features: { area: `A${definition.floor}`, ...(definition.code === 'CONNECT-A2' ? { connecting: true } : {}) },
          status: 'CLEAN' as const,
        };
      });
      await tx.room.createMany({ data: rooms });
    }
    const bar = await tx.ratePlan.findFirst({ where: { propertyId: property.id, code: 'BAR' } });
    if (bar) {
      const rows = TYPES.flatMap((definition) => Array.from({ length: 455 }, (_, day) => {
        const date = new Date(Date.UTC(2026, 8, 1 + day));
        return { ratePlanId: bar.id, roomTypeId: '' as string, date, amount: definition.baseRate, currency: 'VND' };
      }));
      // create rows with resolved room-type ids, in chunks
      const typeRows = await tx.roomType.findMany({ where: { propertyId: property.id }, select: { id: true, code: true } });
      const byCode = new Map(typeRows.map((row) => [row.code, row.id]));
      const data = rows.map(({ roomTypeId: _ignored, ...row }, index) => ({ ...row, roomTypeId: byCode.get(TYPES[Math.floor(index / 455)]!.code)! }));
      for (let i = 0; i < data.length; i += 1000) await tx.ratePlanRate.createMany({ data: data.slice(i, i + 1000), skipDuplicates: true });
    }
    await tx.property.update({ where: { id: property.id }, data: { roomCount: 27 } });
  });
  console.info(`✓ Đã cấu hình ${TYPES.reduce((sum, type) => sum + type.count, 0)} phòng / ${TYPES.length} loại phòng theo sơ đồ A1–A3.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
