/**
 * Seeds operational history so the dashboard, night audit and reconciliation
 * have real ledger-backed numbers from day one. Idempotent: skips when history
 * already exists unless SEED_HISTORY_FORCE=1 (then removes only its own rows).
 *
 * Usage: pnpm --filter @grand-suite/api exec tsx prisma/seed-history.ts
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  addDays,
  buildCommissionDraft,
  buildPaymentDraft,
  buildRevenueDraft,
  commissionFor,
  computeLineTotals,
  isoToday,
  moneyToJson,
  priceStay,
  stayNights,
  type DepartmentGroup,
} from '@grand-suite/shared';

for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path);
    } catch {
      /* ignore */
    }
    break;
  }
}

const prisma = new PrismaClient();
const DAYS = Number(process.env.SEED_HISTORY_DAYS ?? 45);
const FORCE = process.env.SEED_HISTORY_FORCE === '1';

function rng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

async function purge() {
  await prisma.journalEntry.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.payment.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.folioItem.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.folio.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.reservationNight.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.reservationRoom.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.reservation.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.posPayment.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.posOrderItem.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.posOrder.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.housekeepingTask.deleteMany({ where: { id: { startsWith: 'hist-' } } });
  await prisma.nightAudit.deleteMany({ where: { id: { startsWith: 'hist-' } } });
}

async function main() {
  const existing = await prisma.reservation.count({ where: { id: { startsWith: 'hist-' } } });
  if (FORCE) {
    await purge();
  } else if (existing > 0) {
    console.info(`History already present (${existing} stays). Set SEED_HISTORY_FORCE=1 to rebuild.`);
    return;
  }

  const org = await prisma.organization.findFirstOrThrow();
  const allProperties = await prisma.property.findMany({
    where: { orgId: org.id },
    include: {
      rooms: { where: { isActive: true }, include: { roomType: true } },
      outlets: true,
    },
  });
  const channels = await prisma.channel.findMany({ where: { orgId: org.id, isActive: true } });
  const guests = await prisma.guest.findMany({ where: { orgId: org.id }, take: 400 });
  const companies = await prisma.company.findMany({ where: { orgId: org.id } });

  const weightedChannels = [
    ...channels.filter((channel) => channel.type === 'OTA').slice(0, 5).map((channel) => ({ channel, weight: 3 })),
    ...channels.filter((channel) => channel.type === 'SOCIAL').slice(0, 4).map((channel) => ({ channel, weight: 2 })),
    ...channels.filter((channel) => ['DIRECT', 'OFFLINE'].includes(channel.type)).map((channel) => ({ channel, weight: 3 })),
  ];
  const pickChannel = (random: () => number) => {
    const total = weightedChannels.reduce((acc, entry) => acc + entry.weight, 0);
    let target = random() * total;
    for (const entry of weightedChannels) {
      target -= entry.weight;
      if (target <= 0) return entry.channel;
    }
    return weightedChannels[0]?.channel ?? null;
  };

  const end = addDays(isoToday(), -1);
  const start = addDays(end, -(DAYS - 1));
  const rules = { vatPct: 8, serviceChargePct: 5, pricesIncludeTax: false };

  // Existing reservations must never be overlapped by seeded stays.
  const occupied = new Map<string, Set<string>>();
  const existingRooms = await prisma.reservationRoom.findMany({
    where: {
      status: { in: ['RESERVED', 'IN_HOUSE'] },
      checkIn: { lt: new Date(`${addDays(end, 20)}T00:00:00Z`) },
      checkOut: { gt: new Date(`${start}T00:00:00Z`) },
    },
    select: { roomId: true, checkIn: true, checkOut: true },
  });
  for (const room of existingRooms) {
    if (!room.roomId) continue;
    const set = occupied.get(room.roomId) ?? new Set<string>();
    for (const date of stayNights(room.checkIn.toISOString().slice(0, 10), room.checkOut.toISOString().slice(0, 10))) {
      set.add(date);
    }
    occupied.set(room.roomId, set);
  }

  const existingAudits = new Set(
    (await prisma.nightAudit.findMany({ where: { businessDate: { gte: new Date(`${start}T00:00:00Z`) } } })).map(
      (audit) => audit.businessDate.toISOString().slice(0, 10),
    ),
  );

  let totalStays = 0;
  let totalOrders = 0;
  let totalNights = 0;

  for (const property of allProperties) {
    const plan = await prisma.ratePlan.findFirst({ where: { propertyId: property.id, code: 'BAR' } });
    const rateRows = await prisma.ratePlanRate.findMany({
      where: {
        ratePlanId: plan?.id,
        date: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${addDays(end, 20)}T00:00:00Z`) },
      },
    });
    const rateMap = new Map(rateRows.map((rate) => [`${rate.roomTypeId}|${rate.date.toISOString().slice(0, 10)}`, Number(rate.amount)]));
    const menus = await prisma.menuItem.findMany({
      where: { outletId: { in: property.outlets.filter((outlet) => ['RESTAURANT', 'BAR', 'POOL'].includes(outlet.type)).map((outlet) => outlet.id) }, isAvailable: true },
    });
    const menuByOutlet = new Map<string, typeof menus>();
    for (const item of menus) {
      menuByOutlet.set(item.outletId, [...(menuByOutlet.get(item.outletId) ?? []), item]);
    }

    for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
      const date = addDays(start, dayIndex);
      if (existingAudits.has(date)) continue;
      const random = rng(dayIndex * 7919 + property.code.length * 104729);
      const sellable = property.rooms.filter((room) => !['OUT_OF_ORDER', 'OUT_OF_SERVICE'].includes(room.status));
      const target = Math.floor(sellable.length * (0.62 + random() * 0.22));
      const reservations: Prisma.ReservationCreateManyInput[] = [];
      const reservationRooms: Prisma.ReservationRoomCreateManyInput[] = [];
      const nights: Prisma.ReservationNightCreateManyInput[] = [];
      const folios: Prisma.FolioCreateManyInput[] = [];
      const folioItems: Prisma.FolioItemCreateManyInput[] = [];
      const payments: Prisma.PaymentCreateManyInput[] = [];
      const charges: Array<{
        glAccountCode: string;
        department: DepartmentGroup;
        net: number;
        serviceCharge: number;
        vat: number;
        total: number;
        description: string;
        channelId: string | null;
      }> = [];
      const methodTotals = new Map<string, number>();
      const commissionByChannel = new Map<string, { amount: number; channelId: string; name: string }>();
      let roomsSold = 0;

      const shuffled = [...sellable].sort(() => random() - 0.5);
      let created = 0;
      for (const room of shuffled) {
        if (created >= target) break;
        const los = 1 + Math.floor(random() * 3);
        const stayDates = Array.from({ length: los }).map((_, index) => addDays(date, index));
        if (stayDates.some((night) => night > end)) continue;
        const occupiedSet = occupied.get(room.id) ?? new Set<string>();
        if (stayDates.some((night) => occupiedSet.has(night))) continue;
        for (const night of stayDates) occupiedSet.add(night);
        occupied.set(room.id, occupiedSet);

        const guest = guests[Math.floor(random() * guests.length)];
        if (!guest) continue;
        const channel = pickChannel(random);
        const company = random() < 0.12 ? companies[Math.floor(random() * companies.length)] : null;
        const reservationId = `hist-rsv-${property.code}-${date}-${created}`;
        const roomId = `hist-room-${property.code}-${date}-${created}`;
        const folioId = `hist-fol-${property.code}-${date}-${created}`;
        const pricing = priceStay(
          stayDates.map((night) => ({ date: night, rate: rateMap.get(`${room.roomTypeId}|${night}`) ?? room.roomType.baseRate })),
          rules,
        );
        const code = `RSV-${property.code.split('-')[1] ?? 'H'}-H${date.replace(/-/g, '').slice(4)}${String(created).padStart(3, '0')}`;
        const commission = channel ? commissionFor(pricing.total, channel.commissionPct) : new Prisma.Decimal(0);

        reservations.push({
          id: reservationId,
          propertyId: property.id,
          code,
          status: 'CHECKED_OUT',
          channelId: channel?.id ?? null,
          companyId: company?.id ?? null,
          primaryGuestId: guest.id,
          ratePlanId: plan?.id ?? null,
          checkIn: new Date(`${date}T00:00:00Z`),
          checkOut: new Date(`${addDays(date, los)}T00:00:00Z`),
          nights: los,
          adults: 1 + Math.floor(random() * 2),
          children: 0,
          roomsCount: 1,
          totalNet: pricing.net,
          totalServiceCharge: pricing.serviceCharge,
          totalTax: pricing.vat,
          totalAmount: pricing.total,
          commissionAmount: commission,
          paidAmount: pricing.total,
          balance: 0,
          createdById: null,
          checkedInAt: new Date(`${date}T14:00:00Z`),
          checkedOutAt: new Date(`${addDays(date, los)}T06:00:00Z`),
        });
        reservationRooms.push({
          id: roomId,
          reservationId,
          roomTypeId: room.roomTypeId,
          roomId: room.id,
          guestId: guest.id,
          checkIn: new Date(`${date}T00:00:00Z`),
          checkOut: new Date(`${addDays(date, los)}T00:00:00Z`),
          adults: 1,
          children: 0,
          status: 'CHECKED_OUT',
          nightlyRate: pricing.nights[0]?.rate ?? 0,
          totalNet: pricing.net,
          totalServiceCharge: pricing.serviceCharge,
          totalTax: pricing.vat,
          totalAmount: pricing.total,
          folioId,
          keyCards: 1,
        });
        pricing.nights.forEach((night, index) => {
          nights.push({
            id: `hist-night-${property.code}-${date}-${created}-${index}`,
            reservationRoomId: roomId,
            businessDate: new Date(`${night.date}T00:00:00Z`),
            rate: night.rate,
            serviceCharge: night.serviceCharge,
            taxAmount: night.vat,
            total: night.total,
            postedFolioItemId: `hist-item-${property.code}-${date}-${created}-${index}`,
            journalized: true,
            commissionPosted: true,
          });
          folioItems.push({
            id: `hist-item-${property.code}-${date}-${created}-${index}`,
            folioId,
            propertyId: property.id,
            businessDate: new Date(`${night.date}T00:00:00Z`),
            type: 'ROOM_CHARGE',
            department: 'ROOMS',
            description: `Tiền phòng ${room.number} · đêm ${night.date}`,
            quantity: 1,
            unitPrice: night.rate,
            amount: night.rate,
            serviceCharge: night.serviceCharge,
            taxAmount: night.vat,
            total: night.total,
            taxRateCode: 'VAT8',
            glAccountCode: '1000',
            channelId: channel?.id ?? null,
            sourceType: 'SEED_HISTORY',
            journalized: true,
            postedById: null,
          });
          charges.push({
            glAccountCode: '1000',
            department: 'ROOMS',
            net: moneyToJson(night.rate),
            serviceCharge: moneyToJson(night.serviceCharge),
            vat: moneyToJson(night.vat),
            total: moneyToJson(night.total),
            description: 'Doanh thu phòng',
            channelId: channel?.id ?? null,
          });
          roomsSold += 1;
        });
        folios.push({
          id: folioId,
          propertyId: property.id,
          number: `FOL-H-${date.replace(/-/g, '')}-${created}`,
          reservationId,
          guestId: guest.id,
          companyId: company?.id ?? null,
          status: 'SETTLED',
          balance: 0,
          currency: 'VND',
          openedAt: new Date(`${date}T14:00:00Z`),
          closedAt: new Date(`${addDays(date, los)}T06:00:00Z`),
        });

        const method = random() < 0.42 ? 'CASH' : random() < 0.72 ? 'CARD' : 'BANK_TRANSFER';
        payments.push({
          id: `hist-pay-${property.code}-${date}-${created}`,
          propertyId: property.id,
          folioId,
          reservationId,
          method: method as never,
          status: 'SUCCESS',
          amount: pricing.total,
          currency: 'VND',
          exchangeRate: 1,
          amountVnd: pricing.total,
          businessDate: new Date(`${date}T00:00:00Z`),
          paidAt: new Date(`${date}T10:00:00Z`),
          reference: `HIST-${date}-${created}`,
        });
        methodTotals.set(method, (methodTotals.get(method) ?? 0) + moneyToJson(pricing.total));
        if (channel && commission.gt(0)) {
          const current = commissionByChannel.get(channel.id) ?? { amount: 0, channelId: channel.id, name: channel.name };
          current.amount += moneyToJson(commission);
          commissionByChannel.set(channel.id, current);
        }
        created += 1;
        totalStays += 1;
        totalNights += los;
      }

      // POS orders for every property (including the restaurant-only property).
      for (const outlet of property.outlets.filter((item) => ['RESTAURANT', 'BAR', 'POOL'].includes(item.type))) {
        const outletMenu = menuByOutlet.get(outlet.id) ?? [];
        if (outletMenu.length === 0) continue;
        const orderCount = 12 + Math.floor(random() * 12);
        for (let index = 0; index < orderCount; index += 1) {
          const orderId = `hist-pos-${property.code}-${date}-${outlet.code}-${index}`;
          const lines = 1 + Math.floor(random() * 3);
          let subtotal = 0;
          let serviceCharge = 0;
          let tax = 0;
          let total = 0;
          const itemRows: Prisma.PosOrderItemCreateManyInput[] = [];
          for (let line = 0; line < lines; line += 1) {
            const item = outletMenu[Math.floor(random() * outletMenu.length)]!;
            const quantity = 1 + Math.floor(random() * 2);
            const breakdown = computeLineTotals({
              quantity,
              unitPrice: Number(item.price),
              rules: { ...rules, serviceChargePct: Number(outlet.serviceChargePct) },
            });
            subtotal += moneyToJson(breakdown.net);
            serviceCharge += moneyToJson(breakdown.serviceCharge);
            tax += moneyToJson(breakdown.vat);
            total += moneyToJson(breakdown.total);
            itemRows.push({
              id: `hist-posi-${property.code}-${date}-${outlet.code}-${index}-${line}`,
              orderId,
              menuItemId: item.id,
              name: item.name,
              quantity,
              unitPrice: item.price,
              amount: breakdown.net,
              taxAmount: breakdown.vat,
              serviceCharge: breakdown.serviceCharge,
              total: breakdown.total,
              costAmount: new Prisma.Decimal(item.cost).times(quantity),
              station: item.station,
              status: 'SERVED',
              sentAt: new Date(`${date}T11:00:00Z`),
            });
            charges.push({
              glAccountCode: item.station === 'BAR' ? '2100' : '2000',
              department: 'FNB',
              net: moneyToJson(breakdown.net),
              serviceCharge: moneyToJson(breakdown.serviceCharge),
              vat: moneyToJson(breakdown.vat),
              total: moneyToJson(breakdown.total),
              description: item.name,
              channelId: null,
            });
          }
          const method = random() < 0.5 ? 'CASH' : 'CARD';
          methodTotals.set(method, (methodTotals.get(method) ?? 0) + total);
          await prisma.posOrder.create({
            data: {
              id: orderId,
              propertyId: property.id,
              outletId: outlet.id,
              number: `POS-H-${date.replace(/-/g, '').slice(4)}-${outlet.code}-${index}`,
              type: 'DINE_IN',
              status: 'PAID',
              subtotal,
              serviceCharge,
              taxAmount: tax,
              total,
              paidAmount: total,
              businessDate: new Date(`${date}T00:00:00Z`),
              closedAt: new Date(`${date}T13:00:00Z`),
            },
          });
          if (itemRows.length > 0) {
            await prisma.posOrderItem.createMany({ data: itemRows });
          }
          await prisma.posPayment.create({
            data: {
              id: `hist-posp-${property.code}-${date}-${outlet.code}-${index}`,
              orderId,
              method: method as never,
              amount: total,
              paidAt: new Date(`${date}T13:00:00Z`),
            },
          });
          totalOrders += 1;
        }
      }

      const revenueEntryId = `hist-je-rev-${property.code}-${date}`;
      const paymentEntryId = `hist-je-pay-${property.code}-${date}`;
      const revenueDraft = buildRevenueDraft({ memo: `Doanh thu ngày ${date}`, charges });
      const paymentDraft = buildPaymentDraft({
        memo: `Thu tiền ngày ${date}`,
        payments: [...methodTotals.entries()].map(([method, amount]) => ({ method, amount })),
      });

      await prisma.$transaction(
        [
          prisma.journalEntry.create({
            data: {
              id: revenueEntryId,
              orgId: org.id,
              propertyId: property.id,
              businessDate: new Date(`${date}T00:00:00Z`),
              number: `JE-H-${property.code}-${date}`,
              sourceType: 'NIGHT_AUDIT',
              memo: `Doanh thu ngày ${date}`,
              totalDebit: revenueDraft.totalDebit,
              totalCredit: revenueDraft.totalCredit,
            },
          }),
          prisma.journalLine.createMany({
            data: revenueDraft.lines.map((line, index) => ({
              id: `hist-jl-rev-${property.code}-${date}-${index}`,
              entryId: revenueEntryId,
              description: line.description,
              accountCode: line.accountCode,
              debit: line.debit,
              credit: line.credit,
              department: line.department ?? null,
              channelId: line.channelId ?? null,
            })),
          }),
          prisma.journalEntry.create({
            data: {
              id: paymentEntryId,
              orgId: org.id,
              propertyId: property.id,
              businessDate: new Date(`${date}T00:00:00Z`),
              number: `JE-HP-${property.code}-${date}`,
              sourceType: 'PAYMENT',
              memo: `Thu tiền ngày ${date}`,
              totalDebit: paymentDraft.totalDebit,
              totalCredit: paymentDraft.totalCredit,
            },
          }),
          prisma.journalLine.createMany({
            data: paymentDraft.lines.map((line, index) => ({
              id: `hist-jl-pay-${property.code}-${date}-${index}`,
              entryId: paymentEntryId,
              description: line.description,
              accountCode: line.accountCode,
              debit: line.debit,
              credit: line.credit,
            })),
          }),
          ...(reservations.length ? [prisma.reservation.createMany({ data: reservations })] : []),
          ...(folios.length ? [prisma.folio.createMany({ data: folios })] : []),
          ...(reservationRooms.length ? [prisma.reservationRoom.createMany({ data: reservationRooms })] : []),
          ...(nights.length ? [prisma.reservationNight.createMany({ data: nights })] : []),
          ...(folioItems.length
            ? [
                prisma.folioItem.createMany({
                  data: folioItems.map((item) => ({ ...item, journalEntryId: revenueEntryId })),
                }),
              ]
            : []),
          ...(payments.length ? [prisma.payment.createMany({ data: payments })] : []),
          prisma.nightAudit.create({
            data: {
              id: `hist-audit-${property.code}-${date}`,
              propertyId: property.id,
              businessDate: new Date(`${date}T00:00:00Z`),
              status: 'COMPLETED',
              completedAt: new Date(`${addDays(date, 1)}T01:00:00Z`),
              stats: {
                roomsSold,
                totalRevenue: moneyToJson(
                  revenueDraft.lines
                    .filter((line) => ['1000', '2000', '2100'].includes(line.accountCode))
                    .reduce((acc, line) => acc + moneyToJson(line.credit), 0),
                ),
                payments: moneyToJson(paymentDraft.totalDebit),
              },
            },
          }),
        ],
      );

      for (const [channelId, commission] of commissionByChannel) {
        const draft = buildCommissionDraft({
          memo: `Hoa hồng ${commission.name} ngày ${date}`,
          amount: commission.amount,
          channelId,
        });
        await prisma.journalEntry.create({
          data: {
            id: `hist-je-com-${property.code}-${date}-${channelId.slice(-5)}`,
            orgId: org.id,
            propertyId: property.id,
            businessDate: new Date(`${date}T00:00:00Z`),
            number: `JE-HC-${property.code}-${date}-${channelId.slice(-4)}`,
            sourceType: 'NIGHT_AUDIT',
            memo: `Hoa hồng ${commission.name} ngày ${date}`,
            totalDebit: draft.totalDebit,
            totalCredit: draft.totalCredit,
            lines: {
              create: draft.lines.map((line, index) => ({
                description: line.description,
                accountCode: line.accountCode,
                debit: line.debit,
                credit: line.credit,
                id: `hist-jlc-${property.code}-${date}-${channelId.slice(-5)}-${index}`,
              })),
            },
          },
        });
        await prisma.journalLine.updateMany({
          where: { entryId: `hist-je-com-${property.code}-${date}-${channelId.slice(-5)}` },
          data: { channelId },
        });
      }
    }
  }

  // In-house guests for today's front desk board and occupancy.
  for (const property of allProperties.filter((item) => item.rooms.length > 0)) {
    const propertyRooms = await prisma.room.findMany({
      where: { propertyId: property.id, isActive: true, status: { notIn: ['OUT_OF_ORDER', 'OUT_OF_SERVICE'] } },
      include: { roomType: true },
    });
    const today = isoToday();
    const tomorrow = addDays(today, 1);
    const candidates = propertyRooms
      .filter((room) => !(occupied.get(room.id)?.has(today)))
      .slice(0, 120);
    for (const [index, room] of candidates.entries()) {
      const guest = guests[(index * 13) % guests.length];
      if (!guest) continue;
      const random = rng(index + 999);
      const channel = pickChannel(random);
      const remaining = index % 3 === 0 ? today : tomorrow;
      const reservationId = `hist-inhouse-${property.code}-${index}`;
      const folioId = `hist-inhouse-fol-${property.code}-${index}`;
      await prisma.reservation.create({
        data: {
          id: reservationId,
          propertyId: property.id,
          code: `RSV-${property.code.split('-')[1] ?? 'H'}-I${String(index).padStart(4, '0')}`,
          status: 'IN_HOUSE',
          channelId: channel?.id ?? null,
          primaryGuestId: guest.id,
          checkIn: new Date(`${addDays(today, -1)}T00:00:00Z`),
          checkOut: new Date(`${remaining}T00:00:00Z`),
          nights: remaining === today ? 1 : 2,
          adults: 2,
          children: 0,
          roomsCount: 1,
          totalNet: room.roomType.baseRate,
          totalServiceCharge: new Prisma.Decimal(room.roomType.baseRate).times(0.05),
          totalTax: new Prisma.Decimal(room.roomType.baseRate).times(0.084),
          totalAmount: new Prisma.Decimal(room.roomType.baseRate).times(1.134),
          balance: new Prisma.Decimal(room.roomType.baseRate).times(1.134),
          checkedInAt: new Date(`${addDays(today, -1)}T14:00:00Z`),
          rooms: {
            create: {
              id: `hist-inhouse-room-${property.code}-${index}`,
              roomTypeId: room.roomTypeId,
              roomId: room.id,
              guestId: guest.id,
              checkIn: new Date(`${addDays(today, -1)}T00:00:00Z`),
              checkOut: new Date(`${remaining}T00:00:00Z`),
              adults: 2,
              children: 0,
              status: 'IN_HOUSE',
              nightlyRate: room.roomType.baseRate,
              totalNet: room.roomType.baseRate,
              totalAmount: new Prisma.Decimal(room.roomType.baseRate).times(1.134),
              nights: {
                create: [
                  {
                    id: `hist-inhouse-night-${property.code}-${index}-1`,
                    businessDate: new Date(`${addDays(today, -1)}T00:00:00Z`),
                    rate: room.roomType.baseRate,
                    total: new Prisma.Decimal(room.roomType.baseRate).times(1.134),
                    journalized: false,
                  },
                  ...(remaining !== today
                    ? [
                        {
                          id: `hist-inhouse-night-${property.code}-${index}-2`,
                          businessDate: new Date(`${today}T00:00:00Z`),
                          rate: room.roomType.baseRate,
                          total: new Prisma.Decimal(room.roomType.baseRate).times(1.134),
                          journalized: false,
                        },
                      ]
                    : []),
                ],
              },
            },
          },
        },
      });
      await prisma.folio.create({
        data: {
          id: folioId,
          propertyId: property.id,
          number: `FOL-I-${property.code.split('-')[1] ?? 'H'}-${String(index).padStart(4, '0')}`,
          reservationId,
          guestId: guest.id,
          status: 'OPEN',
          balance: 0,
          currency: 'VND',
          openedAt: new Date(`${addDays(today, -1)}T14:00:00Z`),
        },
      });
      await prisma.reservationRoom.updateMany({ where: { reservationId }, data: { folioId } });
    }

    // Confirmed arrivals for today's front-desk queue.
    const arrivalRooms = propertyRooms
      .filter((room) => !(occupied.get(room.id)?.has(today)))
      .slice(120, 140);
    for (const [index, room] of arrivalRooms.entries()) {
      const guest = guests[(index * 7 + 3) % guests.length];
      if (!guest) continue;
      const random = rng(index + 4242);
      const channel = pickChannel(random);
      await prisma.reservation.create({
        data: {
          id: `hist-arrival-${property.code}-${index}`,
          propertyId: property.id,
          code: `RSV-${property.code.split('-')[1] ?? 'H'}-A${String(index).padStart(4, '0')}`,
          status: 'CONFIRMED',
          channelId: channel?.id ?? null,
          primaryGuestId: guest.id,
          checkIn: new Date(`${today}T00:00:00Z`),
          checkOut: new Date(`${addDays(today, 2)}T00:00:00Z`),
          nights: 2,
          adults: 2,
          roomsCount: 1,
          totalAmount: new Prisma.Decimal(room.roomType.baseRate).times(2).times(1.134),
          balance: new Prisma.Decimal(room.roomType.baseRate).times(2).times(1.134),
          rooms: {
            create: {
              id: `hist-arrival-room-${property.code}-${index}`,
              roomTypeId: room.roomTypeId,
              roomId: room.id,
              guestId: guest.id,
              checkIn: new Date(`${today}T00:00:00Z`),
              checkOut: new Date(`${addDays(today, 2)}T00:00:00Z`),
              adults: 2,
              status: 'RESERVED',
              nightlyRate: room.roomType.baseRate,
            },
          },
        },
      });
    }

    // Dirty rooms and pending housekeeping for the mobile board.
    for (const [index, room] of candidates.slice(0, 12).entries()) {
      await prisma.room.update({ where: { id: room.id }, data: { status: 'DIRTY' } });
      await prisma.housekeepingTask.create({
        data: {
          id: `hist-hk-${property.code}-${index}`,
          propertyId: property.id,
          roomId: room.id,
          type: index % 4 === 0 ? 'DEEP_CLEAN' : 'CLEAN',
          status: index % 3 === 0 ? 'IN_PROGRESS' : 'PENDING',
          priority: index % 5 === 0 ? 1 : 2,
          checklist: [
            { item: 'Đổ rác & thay túi', done: false },
            { item: 'Thay ga trải giường', done: false },
            { item: 'Vệ sinh phòng tắm', done: false },
            { item: 'Bổ sung minibar', done: false },
            { item: 'Hút bụi & lau sàn', done: false },
          ],
        },
      });
    }
  }

  console.info(`✔ History: ${totalStays} stays · ${totalNights} room-nights · ${totalOrders} POS orders (${DAYS} days)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
