import { Injectable } from '@nestjs/common';
import {
  JournalSource,
  PaymentMethod,
  PosItemStatus,
  PosOrderStatus,
  PosOrderType,
  Prisma,
} from '@prisma/client';
import {
  ERROR_CODES,
  AppError,
  buildPaymentDraft,
  buildRevenueDraft,
  businessDateOf,
  computeLineTotals,
  moneyToJson,
  parseIsoDate,
} from '@grand-suite/shared';
import type { z } from 'zod';
import type {
  addPosItemsSchema,
  chargeToRoomSchema,
  createPosOrderSchema,
  posPaySchema,
} from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { SequenceService } from '../../common/sequence/sequence.module';
import { PostingService } from '../accounting/posting.service';
import { FoliosService } from '../folios/folios.service';
import { RealtimeService } from '../realtime/realtime.service';

type CreateOrderInput = z.infer<typeof createPosOrderSchema>;
type AddItemsInput = z.infer<typeof addPosItemsSchema>;
type PayInput = z.infer<typeof posPaySchema>;
type ChargeInput = z.infer<typeof chargeToRoomSchema>;

const STATION_ACCOUNT: Record<string, string> = {
  KITCHEN: '2000',
  BAR: '2100',
  SPA: '3000',
};

const STATION_DEPARTMENT: Record<string, 'FNB' | 'OTHER_OPERATED'> = {
  KITCHEN: 'FNB',
  BAR: 'FNB',
  SPA: 'OTHER_OPERATED',
};

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly posting: PostingService,
    private readonly folios: FoliosService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async outlets(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    const outlets = await this.prisma.outlet.findMany({
      where: { propertyId, isActive: true },
      orderBy: { name: 'asc' },
    });
    const areas = await this.prisma.tableArea.findMany({
      where: { outletId: { in: outlets.map((outlet) => outlet.id) } },
      orderBy: { sortOrder: 'asc' },
    });
    const tables = await this.prisma.posTable.findMany({
      where: { outletId: { in: outlets.map((outlet) => outlet.id) } },
      orderBy: { name: 'asc' },
    });
    const openOrders = await this.prisma.posOrder.findMany({
      where: { propertyId, status: { in: ['OPEN', 'SENT', 'SERVED'] } },
      select: { id: true, outletId: true, tableId: true, number: true, total: true, status: true },
    });
    return outlets.map((outlet) => ({
      id: outlet.id,
      name: outlet.name,
      code: outlet.code,
      type: outlet.type,
      serviceChargePct: Number(outlet.serviceChargePct),
      areas: areas
        .filter((area) => area.outletId === outlet.id)
        .map((area) => ({
          id: area.id,
          name: area.name,
          tables: tables.filter((table) => table.outletId === outlet.id && table.areaId === area.id),
        })),
      tables: tables.filter((table) => table.outletId === outlet.id),
      openOrders: openOrders.filter((order) => order.outletId === outlet.id),
    }));
  }

  async menu(actor: AuthUser, outletId: string) {
    const outlet = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    if (!outlet) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy outlet', 404);
    assertPropertyAccess(actor, outlet.propertyId);
    const categories = await this.prisma.menuCategory.findMany({
      where: { outletId },
      include: {
        items: {
          where: { isAvailable: true },
          include: { modifiers: { include: { modifiers: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        description: item.description,
        price: moneyToJson(item.price),
        happyHourPrice: item.happyHourPrice === null ? null : moneyToJson(item.happyHourPrice),
        station: item.station,
        taxRateCode: item.taxRateCode,
        tags: item.tags,
        allergens: item.allergens,
        modifiers: item.modifiers.map((group) => ({
          id: group.id,
          name: group.name,
          required: group.required,
          maxSelect: group.maxSelect,
          options: group.modifiers.map((modifier) => ({
            id: modifier.id,
            name: modifier.name,
            priceDelta: moneyToJson(modifier.priceDelta),
          })),
        })),
      })),
    }));
  }

  async listOrders(actor: AuthUser, query: { propertyId?: string; outletId?: string; status?: string; page: number; pageSize: number }) {
    if (query.propertyId) assertPropertyAccess(actor, query.propertyId);
    const where: Prisma.PosOrderWhereInput = {
      ...(query.propertyId
        ? { propertyId: query.propertyId }
        : actor.orgWide
          ? {}
          : {
              propertyId: {
                in: [...new Set(actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))],
              },
            }),
      ...(query.outletId ? { outletId: query.outletId } : {}),
      ...(query.status ? { status: query.status as PosOrderStatus } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.posOrder.findMany({
        where,
        include: {
          outlet: { select: { id: true, name: true } },
          table: { select: { id: true, name: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.posOrder.count({ where }),
    ]);
    return {
      items: items.map((order) => this.mapOrder(order)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getOrder(actor: AuthUser, id: string) {
    const order = await this.prisma.posOrder.findUnique({
      where: { id },
      include: {
        outlet: true,
        table: true,
        items: true,
        payments: true,
        tickets: true,
      },
    });
    if (!order) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiếu order', 404);
    assertPropertyAccess(actor, order.propertyId);
    return this.mapOrder(order, true);
  }

  async openOrder(actor: AuthUser, input: CreateOrderInput) {
    const outlet = await this.prisma.outlet.findUnique({ where: { id: input.outletId } });
    if (!outlet) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy outlet', 404);
    assertPropertyAccess(actor, outlet.propertyId);

    if (input.tableId) {
      const table = await this.prisma.posTable.findUnique({ where: { id: input.tableId } });
      if (!table || table.outletId !== outlet.id) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Bàn không thuộc outlet này', 422);
      }
      const existing = await this.prisma.posOrder.findFirst({
        where: { tableId: input.tableId, status: { in: ['OPEN', 'SENT', 'SERVED'] } },
        include: { outlet: true, table: true, items: true },
      });
      if (existing) return this.mapOrder(existing, true);
    }

    const property = await this.prisma.property.findUniqueOrThrow({ where: { id: outlet.propertyId } });
    const businessDate = businessDateOf(new Date(), {
      timeZone: property.timezone,
      cutoffHour: property.businessDayCutoff,
    });

    let folioId: string | null = null;
    if (input.reservationId) {
      const folio = await this.prisma.folio.findFirst({
        where: { reservationId: input.reservationId },
        orderBy: { openedAt: 'asc' },
      });
      folioId = folio?.id ?? null;
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, outlet.propertyId, 'POS_ORDER');
      const created = await tx.posOrder.create({
        data: {
          propertyId: outlet.propertyId,
          outletId: outlet.id,
          number,
          tableId: input.tableId ?? null,
          reservationId: input.reservationId ?? null,
          folioId,
          guestId: input.guestId ?? null,
          type: input.type as PosOrderType,
          status: PosOrderStatus.OPEN,
          businessDate: parseIsoDate(businessDate),
          openedById: actor.id,
          notes: input.notes,
        },
        include: { outlet: true, table: true, items: true },
      });
      if (input.tableId) {
        await tx.posTable.update({ where: { id: input.tableId }, data: { status: 'OCCUPIED' } });
      }
      return created;
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: outlet.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'pos.order_opened',
      entityType: 'PosOrder',
      entityId: order.id,
      after: { number: order.number, outlet: outlet.name },
    });
    this.realtime.emitToProperty(outlet.propertyId, 'pos.order_opened', { id: order.id });
    return this.mapOrder(order);
  }

  async addItems(actor: AuthUser, orderId: string, input: AddItemsInput) {
    const order = await this.loadOrder(orderId);
    assertPropertyAccess(actor, order.propertyId);
    if (!['OPEN', 'SENT', 'SERVED'].includes(order.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Order đã đóng', 409);
    }
    const outlet = order.outlet;
    const property = await this.prisma.property.findUniqueOrThrow({ where: { id: order.propertyId } });
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: input.items.map((item) => item.menuItemId) }, outletId: outlet.id },
    });
    const byId = new Map(menuItems.map((item) => [item.id, item]));

    const result = await this.prisma.$transaction(async (tx) => {
      for (const line of input.items) {
        const menuItem = byId.get(line.menuItemId);
        if (!menuItem) throw new AppError(ERROR_CODES.NOT_FOUND, 'Món không tồn tại trong outlet', 404);
        const modifiers = line.modifiers ?? [];
        const unitPrice =
          Number(menuItem.price) + modifiers.reduce((acc, modifier) => acc + modifier.priceDelta, 0);
        const taxRate = await tx.taxRate.findFirst({
          where: { orgId: actor.orgId, code: menuItem.taxRateCode, isActive: true },
        });
        const breakdown = computeLineTotals({
          quantity: line.quantity,
          unitPrice,
          rules: {
            vatPct: taxRate ? Number(taxRate.rate) : 8,
            serviceChargePct: Number(outlet.serviceChargePct),
            pricesIncludeTax: property.pricesIncludeTax,
          },
          currency: property.currency,
        });
        await tx.posOrderItem.create({
          data: {
            orderId,
            menuItemId: menuItem.id,
            name: menuItem.name,
            quantity: line.quantity,
            unitPrice,
            amount: breakdown.net,
            modifiers: modifiers.length > 0 ? (modifiers as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            notes: line.notes,
            station: menuItem.station,
            status: PosItemStatus.QUEUED,
            taxAmount: breakdown.vat,
            serviceCharge: breakdown.serviceCharge,
            total: breakdown.total,
            costAmount: new Prisma.Decimal(menuItem.cost).times(line.quantity),
            seatNo: line.seatNo,
            course: line.course,
          },
        });
      }
      const totals = await this.recomputeTotals(tx, orderId);
      return totals;
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: order.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'pos.items_added',
      entityType: 'PosOrder',
      entityId: orderId,
      after: { items: input.items.length, total: moneyToJson(result.total) },
    });
    return this.getOrder(actor, orderId);
  }

  async send(actor: AuthUser, orderId: string) {
    const order = await this.loadOrder(orderId);
    assertPropertyAccess(actor, order.propertyId);
    if (!['OPEN', 'SENT'].includes(order.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Order không thể gửi bếp', 409);
    }
    const unsent = order.items.filter((item) => !item.sentAt && item.status !== 'VOID');
    if (unsent.length === 0) return this.getOrder(actor, orderId);

    await this.prisma.$transaction(async (tx) => {
      for (const item of unsent) {
        await tx.kdsTicket.create({
          data: {
            propertyId: order.propertyId,
            outletId: order.outletId,
            orderId,
            orderItemId: item.id,
            station: item.station,
            status: 'QUEUED',
            notes: item.notes,
            priority: order.type === 'ROOM_SERVICE' ? 1 : 2,
          },
        });
        await tx.posOrderItem.update({
          where: { id: item.id },
          data: { sentAt: new Date(), status: PosItemStatus.QUEUED },
        });
      }
      await tx.posOrder.update({ where: { id: orderId }, data: { status: PosOrderStatus.SENT } });
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: order.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'pos.order_sent',
      entityType: 'PosOrder',
      entityId: orderId,
      after: { items: unsent.length },
    });
    this.realtime.emitToProperty(order.propertyId, 'pos.order_sent', { id: orderId });
    return this.getOrder(actor, orderId);
  }

  async pay(actor: AuthUser, orderId: string, input: PayInput) {
    const order = await this.loadOrder(orderId);
    assertPropertyAccess(actor, order.propertyId);
    if (['PAID', 'CHARGED_TO_ROOM', 'VOID'].includes(order.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Order đã được thanh toán/đóng', 409);
    }
    const total = moneyToJson(order.total);
    const paid = input.payments.reduce((acc, payment) => acc + payment.amount, 0);
    if (paid + 0.5 < total) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        `Còn thiếu ${(total - paid).toLocaleString('vi-VN')} ₫`,
        422,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const payment of input.payments) {
        await tx.posPayment.create({
          data: {
            orderId,
            method: payment.method as PaymentMethod,
            amount: payment.amount,
            reference: payment.reference,
            cashierId: actor.id,
          },
        });
      }

      const charges = order.items
        .filter((item) => item.status !== 'VOID')
        .map((item) => ({
          glAccountCode: STATION_ACCOUNT[item.station] ?? '2000',
          department: STATION_DEPARTMENT[item.station] ?? ('FNB' as const),
          net: item.amount,
          serviceCharge: item.serviceCharge,
          vat: item.taxAmount,
          total: item.total,
          description: item.name,
          channelId: null,
        }));
      if (charges.length > 0) {
        await this.posting.createEntry(
          tx,
          {
            orgId: actor.orgId,
            propertyId: order.propertyId,
            businessDate: order.businessDate,
            sourceType: JournalSource.POS,
            sourceId: order.id,
            memo: `Doanh thu POS ${order.number}`,
            postedById: actor.id,
          },
          buildRevenueDraft({ memo: `Doanh thu POS ${order.number}`, charges, currency: 'VND' }),
        );
        await this.posting.createEntry(
          tx,
          {
            orgId: actor.orgId,
            propertyId: order.propertyId,
            businessDate: order.businessDate,
            sourceType: JournalSource.PAYMENT,
            sourceId: order.id,
            memo: `Thu tiền POS ${order.number}`,
            postedById: actor.id,
          },
          buildPaymentDraft({
            memo: `Thu tiền POS ${order.number}`,
            payments: input.payments.map((payment) => ({
              method: payment.method,
              amount: payment.amount,
              reference: payment.reference,
            })),
          }),
        );
      }

      await tx.posOrder.update({
        where: { id: orderId },
        data: {
          status: PosOrderStatus.PAID,
          paidAmount: paid,
          closedAt: new Date(),
        },
      });
      if (order.tableId) {
        await tx.posTable.update({ where: { id: order.tableId }, data: { status: 'CLEANING' } });
      }
      return { charged: charges.length };
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: order.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'pos.order_paid',
      entityType: 'PosOrder',
      entityId: orderId,
      after: { total, methods: input.payments.map((payment) => payment.method) },
    });
    this.realtime.emitToProperty(order.propertyId, 'pos.order_paid', { id: orderId });
    return this.getOrder(actor, orderId);
  }

  async chargeToRoom(actor: AuthUser, orderId: string, input: ChargeInput) {
    const order = await this.loadOrder(orderId);
    assertPropertyAccess(actor, order.propertyId);
    if (['PAID', 'CHARGED_TO_ROOM', 'VOID'].includes(order.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Order đã được thanh toán/đóng', 409);
    }
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: input.reservationId },
      include: { folios: true, primaryGuest: true },
    });
    if (!reservation || reservation.propertyId !== order.propertyId) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy đặt phòng để ghi nợ', 404);
    }
    if (!['IN_HOUSE', 'CHECKED_OUT'].includes(reservation.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Chỉ ghi nợ cho khách đang lưu trú', 409);
    }
    const folio = reservation.folios[0];
    if (!folio) throw new AppError(ERROR_CODES.INVALID_STATE, 'Đặt phòng chưa có folio', 409);

    const result = await this.prisma.$transaction(async (tx) => {
      const items = order.items.filter((item) => item.status !== 'VOID');
      const created = [];
      for (const item of items) {
        const folioItem = await tx.folioItem.create({
          data: {
            folioId: folio.id,
            propertyId: order.propertyId,
            businessDate: order.businessDate,
            type: 'FNB_CHARGE',
            department: STATION_DEPARTMENT[item.station] ?? 'FNB',
            description: `${item.name} · ${order.outlet.name}`,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            serviceCharge: item.serviceCharge,
            taxAmount: item.taxAmount,
            total: item.total,
            taxRateCode: 'VAT8',
            glAccountCode: STATION_ACCOUNT[item.station] ?? '2000',
            channelId: reservation.channelId,
            sourceType: 'POS_ORDER',
            sourceId: order.id,
            postedById: actor.id,
          },
        });
        created.push(folioItem);
      }
      if (created.length > 0) {
        await this.posting.postRevenueItems(tx, {
          orgId: actor.orgId,
          propertyId: order.propertyId,
          businessDate: order.businessDate,
          items: created,
          sourceType: JournalSource.POS,
          sourceId: order.id,
          postedById: actor.id,
          memo: `Ghi nợ phòng ${order.number}`,
        });
      }
      const balance = await this.folios.recomputeBalance(tx, folio.id);
      await tx.posOrder.update({
        where: { id: orderId },
        data: {
          status: PosOrderStatus.CHARGED_TO_ROOM,
          folioId: folio.id,
          reservationId: reservation.id,
          closedAt: new Date(),
        },
      });
      if (order.tableId) {
        await tx.posTable.update({ where: { id: order.tableId }, data: { status: 'CLEANING' } });
      }
      return { balance: moneyToJson(balance), folioId: folio.id, reservationCode: reservation.code };
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: order.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'pos.charged_to_room',
      entityType: 'PosOrder',
      entityId: orderId,
      after: {
        folioId: result.folioId,
        reservation: result.reservationCode,
        amount: moneyToJson(order.total),
        balance: result.balance,
      },
    });
    this.realtime.emitToProperty(order.propertyId, 'pos.charged_to_room', { id: orderId });
    return { ...(await this.getOrder(actor, orderId)), folioBalance: result.balance };
  }

  async voidOrder(actor: AuthUser, orderId: string, reason: string) {
    const order = await this.loadOrder(orderId);
    assertPropertyAccess(actor, order.propertyId);
    if (!['OPEN', 'SENT'].includes(order.status)) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Chỉ huỷ được order chưa thanh toán', 409);
    }
    await this.prisma.$transaction([
      this.prisma.posOrder.update({
        where: { id: orderId },
        data: { status: PosOrderStatus.VOID, notes: reason, closedAt: new Date() },
      }),
      this.prisma.posOrderItem.updateMany({ where: { orderId }, data: { status: 'VOID' } }),
      ...(order.tableId
        ? [this.prisma.posTable.update({ where: { id: order.tableId }, data: { status: 'CLEANING' } })]
        : []),
    ]);
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: order.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'pos.order_voided',
      entityType: 'PosOrder',
      entityId: orderId,
      reason,
    });
    return { id: orderId, status: 'VOID' };
  }

  async kdsTickets(actor: AuthUser, propertyId?: string, station?: string, status?: string) {
    if (propertyId) assertPropertyAccess(actor, propertyId);
    const tickets = await this.prisma.kdsTicket.findMany({
      where: {
        ...(propertyId ? { propertyId } : {}),
        ...(station ? { station: station as never } : {}),
        ...(status ? { status: status as never } : { status: { in: ['QUEUED', 'PREPARING', 'READY'] } }),
      },
      include: {
        order: { include: { table: true, outlet: true } },
        orderItem: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
    return tickets.map((ticket) => ({
      id: ticket.id,
      station: ticket.station,
      status: ticket.status,
      priority: ticket.priority,
      notes: ticket.notes,
      createdAt: ticket.createdAt.toISOString(),
      startedAt: ticket.startedAt?.toISOString() ?? null,
      completedAt: ticket.completedAt?.toISOString() ?? null,
      order: {
        id: ticket.order.id,
        number: ticket.order.number,
        type: ticket.order.type,
        table: ticket.order.table?.name ?? null,
        outlet: ticket.order.outlet.name,
      },
      item: ticket.orderItem
        ? {
            name: ticket.orderItem.name,
            quantity: Number(ticket.orderItem.quantity),
            modifiers: ticket.orderItem.modifiers,
            notes: ticket.orderItem.notes,
          }
        : null,
    }));
  }

  async updateKds(actor: AuthUser, ticketId: string, status: string) {
    const ticket = await this.prisma.kdsTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy ticket', 404);
    assertPropertyAccess(actor, ticket.propertyId);
    const updated = await this.prisma.kdsTicket.update({
      where: { id: ticketId },
      data: {
        status: status as never,
        startedAt: status === 'PREPARING' ? new Date() : ticket.startedAt,
        completedAt: ['READY', 'COMPLETED'].includes(status) ? new Date() : ticket.completedAt,
      },
    });
    if (ticket.orderItemId) {
      await this.prisma.posOrderItem.update({
        where: { id: ticket.orderItemId },
        data: {
          status:
            status === 'PREPARING' ? 'PREPARING' : status === 'READY' ? 'READY' : status === 'COMPLETED' ? 'SERVED' : 'QUEUED',
        },
      });
    }
    this.realtime.emitToProperty(ticket.propertyId, 'kds.updated', { id: ticketId, status });
    return { id: updated.id, status: updated.status };
  }

  private async loadOrder(id: string) {
    const order = await this.prisma.posOrder.findUnique({
      where: { id },
      include: { outlet: true, table: true, items: true, tickets: true },
    });
    if (!order) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phiếu order', 404);
    return order;
  }

  private async recomputeTotals(tx: Prisma.TransactionClient, orderId: string) {
    const items = await tx.posOrderItem.findMany({ where: { orderId, status: { not: 'VOID' } } });
    const subtotal = items.reduce((acc, item) => acc.plus(item.amount), new Prisma.Decimal(0));
    const serviceCharge = items.reduce((acc, item) => acc.plus(item.serviceCharge), new Prisma.Decimal(0));
    const taxAmount = items.reduce((acc, item) => acc.plus(item.taxAmount), new Prisma.Decimal(0));
    const total = items.reduce((acc, item) => acc.plus(item.total), new Prisma.Decimal(0));
    return tx.posOrder.update({
      where: { id: orderId },
      data: { subtotal, serviceCharge, taxAmount, total },
    });
  }

  private mapOrder(
    order: {
      id: string;
      number: string;
      status: string;
      type: string;
      subtotal: Prisma.Decimal;
      serviceCharge: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      businessDate: Date;
      notes: string | null;
      tableId: string | null;
      reservationId: string | null;
      folioId: string | null;
      outlet: { id?: string; name: string };
      table?: { id?: string; name: string } | null;
      items: Array<{
        id: string;
        name: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        amount: Prisma.Decimal;
        taxAmount: Prisma.Decimal;
        serviceCharge: Prisma.Decimal;
        total: Prisma.Decimal;
        status: string;
        station: string;
        notes: string | null;
        modifiers: unknown;
        sentAt: Date | null;
      }>;
      tickets?: Array<{ id: string; status: string; station: string }>;
      payments?: Array<{ id: string; method: string; amount: Prisma.Decimal; paidAt: Date; reference: string | null }>;
    },
    withDetails = false,
  ) {
    const mapped = {
      id: order.id,
      number: order.number,
      status: order.status,
      type: order.type,
      subtotal: moneyToJson(order.subtotal),
      serviceCharge: moneyToJson(order.serviceCharge),
      taxAmount: moneyToJson(order.taxAmount),
      total: moneyToJson(order.total),
      paidAmount: moneyToJson(order.paidAmount),
      businessDate: order.businessDate.toISOString().slice(0, 10),
      notes: order.notes,
      tableId: order.tableId,
      table: order.table?.name ?? null,
      reservationId: order.reservationId,
      folioId: order.folioId,
      outlet: { id: order.outlet.id ?? '', name: order.outlet.name },
      itemsCount: order.items.length,
    };
    if (!withDetails) return mapped;
    return {
      ...mapped,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: moneyToJson(item.unitPrice),
        amount: moneyToJson(item.amount),
        taxAmount: moneyToJson(item.taxAmount),
        serviceCharge: moneyToJson(item.serviceCharge),
        total: moneyToJson(item.total),
        status: item.status,
        station: item.station,
        notes: item.notes,
        modifiers: item.modifiers,
        sent: Boolean(item.sentAt),
      })),
      tickets: order.tickets?.map((ticket) => ({ id: ticket.id, status: ticket.status, station: ticket.station })) ?? [],
      payments:
        order.payments?.map((payment) => ({
          id: payment.id,
          method: payment.method,
          amount: moneyToJson(payment.amount),
          paidAt: payment.paidAt.toISOString(),
          reference: payment.reference,
        })) ?? [],
    };
  }
}
