import { Injectable } from '@nestjs/common';
import { FolioItemType, InvoiceStatus, Prisma } from '@prisma/client';
import { ERROR_CODES, AppError, moneyToJson, parseIsoDate, formatMoney } from '@grand-suite/shared';
import type { z } from 'zod';
import type { createInvoiceSchema } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { SequenceService } from '../../common/sequence/sequence.module';

type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

const CHARGE_TYPES: FolioItemType[] = [
  FolioItemType.ROOM_CHARGE,
  FolioItemType.FNB_CHARGE,
  FolioItemType.SPA_CHARGE,
  FolioItemType.EVENT_CHARGE,
  FolioItemType.OTHER_CHARGE,
];

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: AuthUser, folioId: string, input: CreateInvoiceInput) {
    const folio = await this.prisma.folio.findUnique({
      where: { id: folioId },
      include: {
        property: true,
        guest: true,
        company: true,
        items: { where: { isVoid: false, invoiceId: null } },
        payments: { where: { status: 'SUCCESS' } },
      },
    });
    if (!folio) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy folio', 404);
    assertPropertyAccess(actor, folio.propertyId);
    const charges = folio.items.filter((item) => CHARGE_TYPES.includes(item.type));
    if (charges.length === 0) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Folio không còn dòng nào chưa xuất hoá đơn', 409);
    }

    const subtotal = charges.reduce((acc, item) => acc.plus(item.amount), new Prisma.Decimal(0));
    const serviceCharge = charges.reduce((acc, item) => acc.plus(item.serviceCharge), new Prisma.Decimal(0));
    const taxAmount = charges.reduce((acc, item) => acc.plus(item.taxAmount), new Prisma.Decimal(0));
    const total = charges.reduce((acc, item) => acc.plus(item.total), new Prisma.Decimal(0));
    const payments = folio.payments.reduce((acc, payment) => acc.plus(payment.amount), new Prisma.Decimal(0));
    const paidAmount = payments.gt(total) ? total : payments;
    const balance = total.minus(paidAmount);
    const buyerName = input.buyerName ?? folio.company?.name ?? folio.guest.fullName;
    const buyerTaxCode = input.buyerTaxCode ?? folio.company?.taxCode ?? null;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, folio.propertyId, 'INVOICE');
      const created = await tx.invoice.create({
        data: {
          propertyId: folio.propertyId,
          number,
          folioId: folio.id,
          reservationId: folio.reservationId,
          guestId: folio.guestId,
          companyId: folio.companyId,
          status: balance.lte(0) ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
          dueDate: input.dueDate ? parseIsoDate(input.dueDate) : null,
          subtotal,
          serviceCharge,
          taxAmount,
          total,
          paidAmount,
          balance,
          currency: folio.currency,
          taxRateCode: charges[0]?.taxRateCode ?? 'VAT8',
          eInvoiceProvider: 'VNPT_MOCK',
          eInvoiceNo: `EINV-${number}`,
          eInvoiceUrl: `/invoices/${'pending'}/print`,
          eInvoiceStatus: 'ISSUED',
          buyerName,
          buyerTaxCode,
          buyerAddress: input.buyerAddress ?? folio.company?.address ?? null,
          notes: input.notes,
          createdById: actor.id,
          lines: {
            create: charges.map((item) => ({
              description: item.description,
              department: item.department,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              amount: item.amount,
              taxRate: item.taxRateCode === 'VAT8' ? 8 : 10,
              taxAmount: item.taxAmount,
              serviceCharge: item.serviceCharge,
              glAccountCode: item.glAccountCode,
            })),
          },
        },
      });
      await tx.invoice.update({
        where: { id: created.id },
        data: { eInvoiceUrl: `/invoices/${created.id}/print` },
      });
      await tx.folioItem.updateMany({
        where: { id: { in: charges.map((item) => item.id) } },
        data: { invoiceId: created.id },
      });
      return created;
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: folio.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'invoice.issued',
      entityType: 'Invoice',
      entityId: invoice.id,
      after: { number: invoice.number, total: moneyToJson(invoice.total), eInvoiceNo: invoice.eInvoiceNo },
    });
    return this.detail(actor, invoice.id);
  }

  async list(actor: AuthUser, query: { propertyId?: string; page: number; pageSize: number; status?: string }) {
    if (query.propertyId) assertPropertyAccess(actor, query.propertyId);
    const where: Prisma.InvoiceWhereInput = {
      ...(query.propertyId
        ? { propertyId: query.propertyId }
        : actor.orgWide
          ? {}
          : {
              propertyId: {
                in: [...new Set(actor.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))],
              },
            }),
      ...(query.status ? { status: query.status as InvoiceStatus } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: { guest: { select: { fullName: true } }, company: { select: { name: true } } },
        orderBy: { issuedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      items: items.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        issuedAt: invoice.issuedAt.toISOString(),
        buyerName: invoice.buyerName ?? invoice.company?.name ?? invoice.guest?.fullName ?? null,
        total: moneyToJson(invoice.total),
        paidAmount: moneyToJson(invoice.paidAmount),
        balance: moneyToJson(invoice.balance),
        eInvoiceNo: invoice.eInvoiceNo,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async detail(actor: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lines: true,
        guest: true,
        company: true,
        folio: { select: { id: true, number: true } },
        property: true,
      },
    });
    if (!invoice) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hoá đơn', 404);
    assertPropertyAccess(actor, invoice.propertyId);
    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      issuedAt: invoice.issuedAt.toISOString(),
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
      currency: invoice.currency,
      subtotal: moneyToJson(invoice.subtotal),
      serviceCharge: moneyToJson(invoice.serviceCharge),
      taxAmount: moneyToJson(invoice.taxAmount),
      total: moneyToJson(invoice.total),
      paidAmount: moneyToJson(invoice.paidAmount),
      balance: moneyToJson(invoice.balance),
      taxRateCode: invoice.taxRateCode,
      eInvoiceProvider: invoice.eInvoiceProvider,
      eInvoiceNo: invoice.eInvoiceNo,
      eInvoiceUrl: invoice.eInvoiceUrl,
      eInvoiceStatus: invoice.eInvoiceStatus,
      buyerName: invoice.buyerName ?? invoice.company?.name ?? invoice.guest?.fullName ?? null,
      buyerTaxCode: invoice.buyerTaxCode,
      buyerAddress: invoice.buyerAddress,
      notes: invoice.notes,
      voidReason: invoice.voidReason,
      folio: invoice.folio,
      property: {
        name: invoice.property.name,
        code: invoice.property.code,
        taxCode: invoice.property.taxCode,
        address: invoice.property.address,
        phone: invoice.property.phone,
      },
      lines: invoice.lines.map((line) => ({
        id: line.id,
        description: line.description,
        department: line.department,
        quantity: Number(line.quantity),
        unitPrice: moneyToJson(line.unitPrice),
        amount: moneyToJson(line.amount),
        taxRate: Number(line.taxRate),
        taxAmount: moneyToJson(line.taxAmount),
        serviceCharge: moneyToJson(line.serviceCharge),
      })),
    };
  }

  async void(actor: AuthUser, id: string, reason: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hoá đơn', 404);
    assertPropertyAccess(actor, invoice.propertyId);
    if (invoice.status === 'VOID') throw new AppError(ERROR_CODES.INVALID_STATE, 'Hoá đơn đã huỷ', 409);
    if (moneyToJson(invoice.paidAmount) > 0) {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Hoá đơn đã thu tiền — cần hoàn tiền trước khi huỷ', 409);
    }
    await this.prisma.$transaction([
      this.prisma.invoice.update({
        where: { id },
        data: { status: 'VOID', voidReason: reason, voidedAt: new Date(), eInvoiceStatus: 'CANCELLED' },
      }),
      this.prisma.folioItem.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } }),
    ]);
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: invoice.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'invoice.voided',
      entityType: 'Invoice',
      entityId: id,
      reason,
      before: { number: invoice.number, total: moneyToJson(invoice.total) },
    });
    return { id, status: 'VOID' };
  }

  async html(actor: AuthUser, id: string): Promise<string> {
    const invoice = await this.detail(actor, id);
    const money = (value: number) => formatMoney(value, invoice.currency);
    const rows = invoice.lines
      .map(
        (line) => `<tr>
          <td>${escapeHtml(line.description)}</td>
          <td class="num">${line.quantity}</td>
          <td class="num">${money(line.unitPrice)}</td>
          <td class="num">${money(line.amount)}</td>
          <td class="num">${money(line.taxAmount)}</td>
        </tr>`,
      )
      .join('');
    return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"/>
<title>Hoá đơn ${escapeHtml(invoice.number)}</title>
<style>
  body{font-family:'Inter',system-ui,sans-serif;color:#241f1a;margin:0;background:#faf7f0}
  .sheet{max-width:760px;margin:24px auto;background:#fff;padding:40px;border:1px solid #e8dfd1}
  h1{font-family:Georgia,serif;font-weight:500;margin:0 0 4px} .muted{color:#7a6a58;font-size:12px}
  .head{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #e8dfd1;padding-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:24px;font-size:12px}
  th,td{padding:8px 6px;border-bottom:1px solid #efe8dc;text-align:left}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .totals{margin-top:16px;margin-left:auto;width:320px;font-size:12px}
  .totals div{display:flex;justify-content:space-between;padding:4px 0}
  .grand{font-weight:600;border-top:1px solid #241f1a;margin-top:6px;padding-top:8px}
  .badge{display:inline-block;border:1px solid #b08d57;color:#8b6b3f;padding:2px 8px;font-size:10px}
  @media print{body{background:#fff}.sheet{border:none;margin:0}}
</style></head>
<body><div class="sheet">
  <div class="head">
    <div>
      <h1>${escapeHtml(invoice.property.name)}</h1>
      <div class="muted">${escapeHtml(invoice.property.address ?? '')}</div>
      <div class="muted">MST: ${escapeHtml(invoice.property.taxCode ?? '—')}</div>
    </div>
    <div style="text-align:right">
      <div class="badge">${invoice.status === 'VOID' ? 'ĐÃ HUỶ' : 'HOÁ ĐƠN GTGT'}</div>
      <h2 style="font-family:Georgia,serif;font-weight:500;margin:8px 0 0">${escapeHtml(invoice.number)}</h2>
      <div class="muted">Ngày ${new Date(invoice.issuedAt).toLocaleDateString('vi-VN')}</div>
      <div class="muted">${escapeHtml(invoice.eInvoiceNo ?? '')}</div>
    </div>
  </div>
  <p class="muted" style="margin-top:16px">Khách hàng: <strong>${escapeHtml(invoice.buyerName ?? '')}</strong><br/>
  MST: ${escapeHtml(invoice.buyerTaxCode ?? '—')} · Địa chỉ: ${escapeHtml(invoice.buyerAddress ?? '—')}<br/>
  Folio: ${escapeHtml(invoice.folio?.number ?? '—')}</p>
  <table><thead><tr><th>Diễn giải</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th class="num">VAT</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>Cộng tiền hàng</span><span>${money(invoice.subtotal)}</span></div>
    <div><span>Phí dịch vụ</span><span>${money(invoice.serviceCharge)}</span></div>
    <div><span>Thuế GTGT</span><span>${money(invoice.taxAmount)}</span></div>
    <div class="grand"><span>Tổng thanh toán</span><span>${money(invoice.total)}</span></div>
    <div><span>Đã thanh toán</span><span>${money(invoice.paidAmount)}</span></div>
    <div><span>Còn lại</span><span>${money(invoice.balance)}</span></div>
  </div>
  <p class="muted" style="margin-top:32px">Hoá đơn điện tử mô phỏng (VNPT adapter). Chứng từ có giá trị demo, không phải hoá đơn thật.</p>
</div></body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
