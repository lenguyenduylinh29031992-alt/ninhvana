import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JournalSource, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  AppError,
  businessDateOf,
  finalizeJournal,
  moneyToJson,
  parseIsoDate,
  paymentGlAccount,
} from '@grand-suite/shared';
import type { z } from 'zod';
import type { cashSessionCloseSchema, cashSessionOpenSchema, paymentIntentSchema, refundSchema } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { SequenceService } from '../../common/sequence/sequence.module';
import { PostingService } from '../accounting/posting.service';
import { RealtimeService } from '../realtime/realtime.service';

type IntentInput = z.infer<typeof paymentIntentSchema>;
type RefundInput = z.infer<typeof refundSchema>;
type OpenSessionInput = z.infer<typeof cashSessionOpenSchema>;
type CloseSessionInput = z.infer<typeof cashSessionCloseSchema>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: AuthUser, query: { propertyId?: string; from?: string; to?: string; page: number; pageSize: number }) {
    if (query.propertyId) assertPropertyAccess(actor, query.propertyId);
    const where: Prisma.PaymentWhereInput = {
      ...(query.propertyId
        ? { propertyId: query.propertyId }
        : actor.orgWide
          ? {}
          : {
              propertyId: {
                in: [...new Set(actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))],
              },
            }),
      ...(query.from || query.to
        ? {
            businessDate: {
              ...(query.from ? { gte: parseIsoDate(query.from) } : {}),
              ...(query.to ? { lte: parseIsoDate(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: { folio: { select: { number: true } }, reservation: { select: { code: true } } },
        orderBy: { paidAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      items: items.map((payment) => ({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: moneyToJson(payment.amount),
        currency: payment.currency,
        reference: payment.reference,
        businessDate: payment.businessDate.toISOString().slice(0, 10),
        paidAt: payment.paidAt.toISOString(),
        folioNumber: payment.folio?.number ?? null,
        reservationCode: payment.reservation?.code ?? null,
        refundedAmount: moneyToJson(payment.refundedAmount),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async refund(actor: AuthUser, paymentId: string, input: RefundInput) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy giao dịch', 404);
    assertPropertyAccess(actor, payment.propertyId);
    if (payment.status !== 'SUCCESS' && payment.status !== 'REFUNDED') {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Giao dịch chưa thanh toán thành công', 409);
    }
    const refundable = moneyToJson(payment.amount) - moneyToJson(payment.refundedAmount);
    if (input.amount > refundable + 0.5) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Số tiền hoàn vượt quá mức còn lại (${refundable.toLocaleString('vi-VN')} ₫)`,
        422,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          paymentId,
          amount: input.amount,
          reason: input.reason,
          approvedById: actor.id,
        },
      });
      const refunded = new Prisma.Decimal(payment.refundedAmount).plus(input.amount);
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          refundedAmount: refunded,
          status: refunded.gte(payment.amount) ? PaymentStatus.REFUNDED : PaymentStatus.SUCCESS,
        },
      });
      const entry = await this.posting.createEntry(
        tx,
        {
          orgId: actor.orgId,
          propertyId: payment.propertyId,
          businessDate: payment.businessDate,
          sourceType: JournalSource.PAYMENT,
          sourceId: refund.id,
          memo: `Hoàn tiền giao dịch ${payment.id.slice(-8)}`,
          postedById: actor.id,
        },
        finalizeJournal(`Hoàn tiền ${input.amount.toLocaleString('vi-VN')} ₫`, [
          {
            accountCode: '1310',
            description: 'Hoàn tiền cho khách',
            debit: input.amount as unknown as Prisma.Decimal,
            credit: new Prisma.Decimal(0),
          },
          {
            accountCode: paymentGlAccount(payment.method),
            description: 'Chi hoàn tiền',
            debit: new Prisma.Decimal(0),
            credit: input.amount as unknown as Prisma.Decimal,
          },
        ]),
      );
      return { refund, entry };
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: payment.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'payment.refunded',
      entityType: 'Payment',
      entityId: paymentId,
      reason: input.reason,
      after: { amount: input.amount, refundId: result.refund.id, entryId: result.entry.id },
    });
    this.realtime.emitToProperty(payment.propertyId, 'payment.refunded', { paymentId });
    return { refundId: result.refund.id, refundedAmount: input.amount };
  }

  /** Creates a pending intent with a VietQR-style payload for the UI mock. */
  async createIntent(actor: AuthUser, input: IntentInput) {
    assertPropertyAccess(actor, input.propertyId);
    const property = await this.prisma.property.findUnique({ where: { id: input.propertyId } });
    if (!property) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy cơ sở', 404);
    const businessDate = businessDateOf(new Date(), {
      timeZone: property.timezone,
      cutoffHour: property.businessDayCutoff,
    });
    const payment = await this.prisma.payment.create({
      data: {
        propertyId: property.id,
        folioId: input.folioId ?? null,
        method: input.method as PaymentMethod,
        status: PaymentStatus.PENDING,
        amount: input.amount,
        currency: property.currency,
        exchangeRate: 1,
        amountVnd: input.amount,
        businessDate: parseIsoDate(businessDate),
        reference: `INTENT-${randomUUID().slice(0, 8).toUpperCase()}`,
        gatewayResponse: { mock: true, provider: input.method },
        createdById: actor.id,
      },
    });

    const qrContent = `00020101021238${String(input.amount).padStart(8, '0')}5802VN6304${payment.reference?.slice(-4) ?? 'MOCK'}`;
    return {
      paymentId: payment.id,
      provider: input.method,
      amount: input.amount,
      qrContent,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      mock: true,
    };
  }

  async openCashSession(actor: AuthUser, input: OpenSessionInput) {
    assertPropertyAccess(actor, input.propertyId);
    const existing = await this.prisma.cashSession.findFirst({
      where: { propertyId: input.propertyId, cashierId: actor.id, status: 'OPEN' },
    });
    if (existing) return this.mapSession(existing);
    const code = await this.sequence.nextPublic(input.propertyId, 'CASH_SESSION');
    const session = await this.prisma.cashSession.create({
      data: {
        propertyId: input.propertyId,
        code,
        cashierId: actor.id,
        openingFloat: input.openingFloat,
        expectedCash: input.openingFloat,
      },
    });
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: input.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'cash_session.opened',
      entityType: 'CashSession',
      entityId: session.id,
      after: { code, openingFloat: input.openingFloat },
    });
    return this.mapSession(session);
  }

  async closeCashSession(actor: AuthUser, id: string, input: CloseSessionInput) {
    const session = await this.prisma.cashSession.findUnique({ where: { id } });
    if (!session) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy ca tiền', 404);
    assertPropertyAccess(actor, session.propertyId);
    if (session.status === 'CLOSED') throw new AppError(ERROR_CODES.INVALID_STATE, 'Ca tiền đã đóng', 409);

    const expected = moneyToJson(session.expectedCash);
    const variance = Number((input.countedCash - expected).toFixed(2));
    const updated = await this.prisma.cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        countedCash: input.countedCash,
        variance,
        closedAt: new Date(),
        notes: input.notes,
      },
    });
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: session.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'cash_session.closed',
      entityType: 'CashSession',
      entityId: id,
      after: { expected, counted: input.countedCash, variance },
    });
    return this.mapSession(updated);
  }

  async listCashSessions(actor: AuthUser, propertyId?: string) {
    if (propertyId) assertPropertyAccess(actor, propertyId);
    const sessions = await this.prisma.cashSession.findMany({
      where: propertyId
        ? { propertyId }
        : actor.orgWide
          ? {}
          : {
              propertyId: {
                in: [...new Set(actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))],
              },
            },
      orderBy: { openedAt: 'desc' },
      take: 30,
    });
    return sessions.map((session) => this.mapSession(session));
  }

  private mapSession(session: {
    id: string;
    code: string;
    status: string;
    openingFloat: Prisma.Decimal;
    cashSales: Prisma.Decimal;
    cardSales: Prisma.Decimal;
    transferSales: Prisma.Decimal;
    otherSales: Prisma.Decimal;
    expectedCash: Prisma.Decimal;
    countedCash: Prisma.Decimal | null;
    variance: Prisma.Decimal | null;
    openedAt: Date;
    closedAt: Date | null;
    notes: string | null;
  }) {
    return {
      id: session.id,
      code: session.code,
      status: session.status,
      openingFloat: moneyToJson(session.openingFloat),
      cashSales: moneyToJson(session.cashSales),
      cardSales: moneyToJson(session.cardSales),
      transferSales: moneyToJson(session.transferSales),
      otherSales: moneyToJson(session.otherSales),
      expectedCash: moneyToJson(session.expectedCash),
      countedCash: session.countedCash === null ? null : moneyToJson(session.countedCash),
      variance: session.variance === null ? null : moneyToJson(session.variance),
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      notes: session.notes,
    };
  }
}
