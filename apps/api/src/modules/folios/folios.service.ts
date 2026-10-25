import { Injectable } from '@nestjs/common';
import {
  FolioItemType,
  FolioStatus,
  JournalSource,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  type Folio,
} from '@prisma/client';
import {
  ERROR_CODES,
  AppError,
  businessDateOf,
  computeLineTotals,
  finalizeJournal,
  moneyToJson,
  parseIsoDate,
  type DepartmentGroup,
  type LedgerLineDraft,
} from '@grand-suite/shared';
import type { z } from 'zod';
import type { folioChargeSchema, folioPaymentSchema } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { PostingService } from '../accounting/posting.service';
import { RealtimeService } from '../realtime/realtime.service';

type ChargeInput = z.infer<typeof folioChargeSchema>;
type PaymentInput = z.infer<typeof folioPaymentSchema>;

const DEPARTMENT_GL: Record<string, string> = {
  ROOMS: '1000',
  FNB: '2000',
  OTHER_OPERATED: '3000',
  MISCELLANEOUS: '3200',
  UNDISTRIBUTED: '3200',
  ADMIN: '3200',
  SALES: '3200',
  PROPERTY_OPS: '3200',
  UTILITIES: '3200',
  MAINTENANCE: '3200',
  FIXED: '3200',
};

const CHARGE_TYPES: FolioItemType[] = [
  FolioItemType.ROOM_CHARGE,
  FolioItemType.FNB_CHARGE,
  FolioItemType.SPA_CHARGE,
  FolioItemType.EVENT_CHARGE,
  FolioItemType.OTHER_CHARGE,
  FolioItemType.DISCOUNT,
  FolioItemType.ADJUSTMENT,
];

@Injectable()
export class FoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: AuthUser, query: { propertyId?: string; status?: string; q?: string; page: number; pageSize: number }) {
    if (query.propertyId) assertPropertyAccess(actor, query.propertyId);
    const where: Prisma.FolioWhereInput = {
      ...(query.propertyId
        ? { propertyId: query.propertyId }
        : actor.orgWide
          ? {}
          : {
              propertyId: {
                in: [...new Set(actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))],
              },
            }),
      ...(query.status ? { status: query.status as FolioStatus } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { guest: { fullName: { contains: query.q, mode: 'insensitive' } } },
              { reservation: { code: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.folio.findMany({
        where,
        include: {
          guest: { select: { id: true, fullName: true, vipLevel: true } },
          reservation: { select: { id: true, code: true, checkIn: true, checkOut: true } },
          _count: { select: { items: true } },
        },
        orderBy: { openedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.folio.count({ where }),
    ]);
    return {
      items: items.map((folio) => ({
        id: folio.id,
        number: folio.number,
        status: folio.status,
        balance: moneyToJson(folio.balance),
        guest: folio.guest,
        reservation: folio.reservation
          ? {
              id: folio.reservation.id,
              code: folio.reservation.code,
              checkIn: folio.reservation.checkIn.toISOString().slice(0, 10),
              checkOut: folio.reservation.checkOut.toISOString().slice(0, 10),
            }
          : null,
        itemsCount: folio._count.items,
        openedAt: folio.openedAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async detail(actor: AuthUser, id: string) {
    const folio = await this.prisma.folio.findUnique({
      where: { id },
      include: {
        property: {
          select: { id: true, name: true, code: true, orgId: true, currency: true, taxCode: true, address: true },
        },
        guest: true,
        company: true,
        reservation: { include: { rooms: { include: { room: true } }, channel: true } },
        items: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
        invoices: true,
      },
    });
    if (!folio) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy folio', 404);
    assertPropertyAccess(actor, folio.propertyId);
    return this.mapDetail(folio);
  }

  async addCharge(actor: AuthUser, folioId: string, input: ChargeInput) {
    const folio = await this.loadFolio(folioId);
    assertPropertyAccess(actor, folio.propertyId);
    if (folio.status !== 'OPEN') throw new AppError(ERROR_CODES.INVALID_STATE, 'Folio đã đóng', 409);
    if (!CHARGE_TYPES.includes(input.type as FolioItemType)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Loại phí không hợp lệ', 422);
    }

    const taxRate = await this.prisma.taxRate.findFirst({
      where: { orgId: folio.property.orgId, code: input.taxRateCode, isActive: true },
    });
    const serviceChargePct =
      input.serviceChargePct ??
      (['ROOM_CHARGE', 'FNB_CHARGE', 'SPA_CHARGE'].includes(input.type)
        ? Number(folio.property.serviceChargePct)
        : 0);
    const breakdown = computeLineTotals({
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      rules: {
        vatPct: taxRate ? Number(taxRate.rate) : 8,
        serviceChargePct,
        pricesIncludeTax: folio.property.pricesIncludeTax,
      },
      currency: folio.currency,
    });
    const businessDate =
      input.businessDate ??
      businessDateOf(new Date(), {
        timeZone: folio.property.timezone,
        cutoffHour: folio.property.businessDayCutoff,
      });
    const department = input.department as DepartmentGroup;
    const glAccountCode = input.glAccountCode ?? DEPARTMENT_GL[department] ?? '3200';

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.folioItem.create({
        data: {
          folioId,
          propertyId: folio.propertyId,
          businessDate: parseIsoDate(businessDate),
          type: input.type as FolioItemType,
          department,
          description: input.description,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          amount: breakdown.net,
          serviceCharge: breakdown.serviceCharge,
          taxAmount: breakdown.vat,
          total: breakdown.total,
          taxRateCode: taxRate?.code ?? input.taxRateCode,
          glAccountCode,
          channelId: folio.reservation?.channelId ?? null,
          sourceType: input.sourceType ?? 'MANUAL',
          sourceId: input.sourceId ?? null,
          postedById: actor.id,
        },
      });

      await this.posting.postRevenueItems(tx, {
        orgId: folio.property.orgId,
        propertyId: folio.propertyId,
        businessDate: item.businessDate,
        items: [item],
        sourceType: JournalSource.POS,
        sourceId: folioId,
        postedById: actor.id,
        memo: `${input.description} · ${folio.number}`,
      });

      const balance = await this.recomputeBalance(tx, folioId);
      return { item, balance };
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: folio.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'folio.charge_posted',
      entityType: 'FolioItem',
      entityId: result.item.id,
      after: { folio: folio.number, description: input.description, amount: moneyToJson(result.item.total) },
    });
    this.realtime.emitToProperty(folio.propertyId, 'folio.updated', { folioId });
    return { id: result.item.id, balance: moneyToJson(result.balance) };
  }

  async addPayment(actor: AuthUser, folioId: string, input: PaymentInput) {
    const folio = await this.loadFolio(folioId);
    assertPropertyAccess(actor, folio.propertyId);
    if (folio.status === 'VOID') throw new AppError(ERROR_CODES.INVALID_STATE, 'Folio đã huỷ', 409);

    const balance = moneyToJson(folio.balance);
    if (input.amount > balance + 0.5) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Số tiền vượt quá số dư còn lại (${balance.toLocaleString('vi-VN')} ₫)`,
        422,
      );
    }
    const businessDate =
      input.businessDate ??
      businessDateOf(new Date(), {
        timeZone: folio.property.timezone,
        cutoffHour: folio.property.businessDayCutoff,
      });

    const result = await this.prisma.$transaction(async (tx) => {
      let cashSessionId = input.cashSessionId ?? null;
      if (input.method === 'CASH') {
        const open = await tx.cashSession.findFirst({
          where: { propertyId: folio.propertyId, cashierId: actor.id, status: 'OPEN' },
        });
        if (open) cashSessionId = open.id;
      }

      const payment = await tx.payment.create({
        data: {
          propertyId: folio.propertyId,
          folioId,
          reservationId: folio.reservationId,
          cashSessionId,
          method: input.method as PaymentMethod,
          status: PaymentStatus.SUCCESS,
          amount: input.amount,
          currency: folio.currency,
          exchangeRate: 1,
          amountVnd: input.amount,
          businessDate: parseIsoDate(businessDate),
          reference: input.reference,
          createdById: actor.id,
        },
      });

      const item = await tx.folioItem.create({
        data: {
          folioId,
          propertyId: folio.propertyId,
          businessDate: payment.businessDate,
          type: FolioItemType.PAYMENT,
          department: 'MISCELLANEOUS',
          description: `Thanh toán · ${this.methodLabel(input.method)}${input.reference ? ` · ${input.reference}` : ''}`,
          quantity: 1,
          unitPrice: -input.amount,
          amount: input.amount,
          total: -input.amount,
          glAccountCode: '1310',
          sourceType: 'PAYMENT',
          sourceId: payment.id,
          postedById: actor.id,
          journalized: true,
        },
      });

      const entry = await this.posting.postPayments(tx, {
        orgId: folio.property.orgId,
        propertyId: folio.propertyId,
        businessDate: payment.businessDate,
        payments: [
          {
            method: input.method,
            amount: input.amount,
            reference: input.reference,
            guestId: folio.guestId,
            reservationId: folio.reservationId,
          },
        ],
        sourceType: JournalSource.PAYMENT,
        sourceId: payment.id,
        postedById: actor.id,
        memo: `Thanh toán ${folio.number}`,
      });
      if (entry) await tx.folioItem.update({ where: { id: item.id }, data: { journalEntryId: entry.id } });

      if (cashSessionId) {
        const cash = input.method === 'CASH';
        const card = input.method === 'CARD';
        await tx.cashSession.update({
          where: { id: cashSessionId },
          data: {
            cashSales: cash ? { increment: input.amount } : undefined,
            cardSales: card ? { increment: input.amount } : undefined,
            transferSales: !cash && !card ? { increment: input.amount } : undefined,
            expectedCash: cash ? { increment: input.amount } : undefined,
          },
        });
      }

      const newBalance = await this.recomputeBalance(tx, folioId);
      await this.syncReservation(tx, folio);
      await this.syncInvoices(tx, folio);
      return { payment, balance: moneyToJson(newBalance) };
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: folio.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'folio.payment',
      entityType: 'Payment',
      entityId: result.payment.id,
      after: { folio: folio.number, method: input.method, amount: input.amount, balance: result.balance },
    });
    this.realtime.emitToProperty(folio.propertyId, 'folio.updated', { folioId });
    return { paymentId: result.payment.id, balance: result.balance };
  }

  async voidItem(actor: AuthUser, itemId: string, reason: string) {
    const item = await this.prisma.folioItem.findUnique({
      where: { id: itemId },
      include: { folio: { include: { property: true } } },
    });
    if (!item) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy dòng folio', 404);
    assertPropertyAccess(actor, item.propertyId);
    if (item.isVoid) throw new AppError(ERROR_CODES.INVALID_STATE, 'Dòng này đã được huỷ', 409);
    if (item.invoiceId) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Dòng đã xuất hoá đơn — cần huỷ hoá đơn trước', 409);
    }
    if (item.type === FolioItemType.PAYMENT) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Không huỷ trực tiếp thanh toán — dùng chức năng hoàn tiền', 409);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let reversalId: string | null = null;
      if (item.journalized && item.journalEntryId) {
        const original = await tx.journalEntry.findUnique({
          where: { id: item.journalEntryId },
          include: { lines: true },
        });
        if (original) {
          const reversedLines: LedgerLineDraft[] = original.lines.map((line) => ({
            accountCode: line.accountCode,
            description: `Huỷ: ${line.description}`,
            debit: line.credit,
            credit: line.debit,
            department: line.department as DepartmentGroup | null,
            channelId: line.channelId,
            guestId: line.guestId,
            reservationId: line.reservationId,
          }));
          const entry = await this.posting.createEntry(
            tx,
            {
              orgId: item.folio.property.orgId,
              propertyId: item.propertyId,
              businessDate: item.businessDate,
              sourceType: JournalSource.MANUAL,
              sourceId: item.id,
              memo: `Đảo bút toán huỷ dòng ${item.description}`,
              postedById: actor.id,
            },
            finalizeJournal(`Huỷ ${item.description}`, reversedLines),
          );
          await tx.journalEntry.update({
            where: { id: entry.id },
            data: { isReversal: true, reversalOfId: original.id },
          });
          reversalId = entry.id;
        }
      }

      await tx.folioItem.update({
        where: { id: itemId },
        data: { isVoid: true, voidReason: reason, voidedAt: new Date(), voidedById: actor.id },
      });
      const balance = await this.recomputeBalance(tx, item.folioId);
      await this.syncReservation(tx, item.folio);
      return { balance, reversalId };
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: item.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'folio.item_voided',
      entityType: 'FolioItem',
      entityId: itemId,
      reason,
      before: { description: item.description, total: moneyToJson(item.total) },
      after: { balance: moneyToJson(result.balance), reversalId: result.reversalId },
    });
    this.realtime.emitToProperty(item.propertyId, 'folio.updated', { folioId: item.folioId });
    return { balance: moneyToJson(result.balance), reversalId: result.reversalId };
  }

  async recomputeBalance(tx: Prisma.TransactionClient, folioId: string) {
    const aggregate = await tx.folioItem.aggregate({
      where: { folioId, isVoid: false },
      _sum: { total: true },
    });
    const balance = aggregate._sum.total ?? new Prisma.Decimal(0);
    await tx.folio.update({
      where: { id: folioId },
      data: { balance, status: balance.lte(0) ? FolioStatus.SETTLED : FolioStatus.OPEN },
    });
    return balance;
  }

  private async syncReservation(tx: Prisma.TransactionClient, folio: Folio) {
    if (!folio.reservationId) return;
    const reservation = await tx.reservation.findUnique({
      where: { id: folio.reservationId },
      select: { totalAmount: true },
    });
    if (!reservation) return;
    const payments = await tx.payment.aggregate({
      where: { reservationId: folio.reservationId, status: PaymentStatus.SUCCESS },
      _sum: { amount: true, refundedAmount: true },
    });
    const paid = (payments._sum.amount ?? new Prisma.Decimal(0)).minus(
      payments._sum.refundedAmount ?? new Prisma.Decimal(0),
    );
    await tx.reservation.update({
      where: { id: folio.reservationId },
      data: { paidAmount: paid, balance: reservation.totalAmount.minus(paid) },
    });
  }

  private async syncInvoices(tx: Prisma.TransactionClient, folio: Folio) {
    const invoices = await tx.invoice.findMany({
      where: { folioId: folio.id, status: { in: ['ISSUED', 'PAID'] } },
    });
    for (const invoice of invoices) {
      const payments = await tx.payment.aggregate({
        where: { folioId: folio.id, status: PaymentStatus.SUCCESS },
        _sum: { amount: true },
      });
      const paidAmount = payments._sum.amount ?? new Prisma.Decimal(0);
      const balance = invoice.total.minus(paidAmount);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount, balance, status: balance.lte(0) ? 'PAID' : 'ISSUED' },
      });
    }
  }

  private async loadFolio(id: string) {
    const folio = await this.prisma.folio.findUnique({
      where: { id },
      include: {
        property: true,
        guest: true,
        reservation: { select: { id: true, code: true, channelId: true } },
      },
    });
    if (!folio) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy folio', 404);
    return folio;
  }

  private methodLabel(method: string): string {
    const labels: Record<string, string> = {
      CASH: 'Tiền mặt',
      CARD: 'Thẻ',
      BANK_TRANSFER: 'Chuyển khoản',
      VIETQR: 'VietQR',
      VNPAY: 'VNPay',
      MOMO: 'MoMo',
      ZALO_PAY: 'ZaloPay',
      STRIPE: 'Stripe',
      COMPANY_AR: 'Công nợ công ty',
    };
    return labels[method] ?? method;
  }

  private mapDetail(folio: {
    id: string;
    number: string;
    status: string;
    balance: Prisma.Decimal;
    currency: string;
    openedAt: Date;
    closedAt: Date | null;
    notes: string | null;
    property: { id: string; name: string; code: string; orgId: string; currency: string; taxCode: string | null; address: string | null };
    guest: { id: string; fullName: string; email: string | null; phone: string | null; vipLevel: number; nationality: string | null };
    company: { id: string; name: string; taxCode: string | null } | null;
    reservation: {
      id: string;
      code: string;
      checkIn: Date;
      checkOut: Date;
      rooms: Array<{ room: { number: string } | null }>;
      channel: { code: string; name: string } | null;
    } | null;
    items: Array<{
      id: string;
      businessDate: Date;
      type: string;
      department: string;
      description: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      amount: Prisma.Decimal;
      serviceCharge: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      isVoid: boolean;
      voidReason: string | null;
      journalized: boolean;
      invoiceId: string | null;
      createdAt: Date;
    }>;
    payments: Array<{ id: string; method: string; status: string; amount: Prisma.Decimal; paidAt: Date; reference: string | null }>;
    invoices: Array<{ id: string; number: string; status: string; total: Prisma.Decimal; balance: Prisma.Decimal }>;
  }) {
    const charges = folio.items.filter(
      (item) => !item.isVoid && !['PAYMENT', 'REFUND', 'DISCOUNT', 'TRANSFER'].includes(item.type),
    );
    return {
      id: folio.id,
      number: folio.number,
      status: folio.status,
      balance: moneyToJson(folio.balance),
      currency: folio.currency,
      openedAt: folio.openedAt.toISOString(),
      closedAt: folio.closedAt?.toISOString() ?? null,
      notes: folio.notes,
      property: {
        id: folio.property.id,
        name: folio.property.name,
        code: folio.property.code,
        taxCode: folio.property.taxCode,
        address: folio.property.address,
      },
      guest: folio.guest,
      company: folio.company,
      reservation: folio.reservation
        ? {
            id: folio.reservation.id,
            code: folio.reservation.code,
            checkIn: folio.reservation.checkIn.toISOString().slice(0, 10),
            checkOut: folio.reservation.checkOut.toISOString().slice(0, 10),
            rooms: folio.reservation.rooms.map((room) => room.room?.number).filter(Boolean),
            channel: folio.reservation.channel,
          }
        : null,
      totals: {
        net: moneyToJson(charges.reduce((acc, item) => acc.plus(item.amount), new Prisma.Decimal(0))),
        serviceCharge: moneyToJson(charges.reduce((acc, item) => acc.plus(item.serviceCharge), new Prisma.Decimal(0))),
        vat: moneyToJson(charges.reduce((acc, item) => acc.plus(item.taxAmount), new Prisma.Decimal(0))),
        gross: moneyToJson(charges.reduce((acc, item) => acc.plus(item.total), new Prisma.Decimal(0))),
        paid: moneyToJson(
          folio.payments
            .filter((payment) => payment.status === 'SUCCESS')
            .reduce((acc, payment) => acc.plus(payment.amount), new Prisma.Decimal(0)),
        ),
      },
      items: folio.items.map((item) => ({
        id: item.id,
        businessDate: item.businessDate.toISOString().slice(0, 10),
        type: item.type,
        department: item.department,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: moneyToJson(item.unitPrice),
        amount: moneyToJson(item.amount),
        serviceCharge: moneyToJson(item.serviceCharge),
        taxAmount: moneyToJson(item.taxAmount),
        total: moneyToJson(item.total),
        isVoid: item.isVoid,
        voidReason: item.voidReason,
        journalized: item.journalized,
        invoiceId: item.invoiceId,
        createdAt: item.createdAt.toISOString(),
      })),
      payments: folio.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: moneyToJson(payment.amount),
        paidAt: payment.paidAt.toISOString(),
        reference: payment.reference,
      })),
      invoices: folio.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        total: moneyToJson(invoice.total),
        balance: moneyToJson(invoice.balance),
      })),
    };
  }
}
