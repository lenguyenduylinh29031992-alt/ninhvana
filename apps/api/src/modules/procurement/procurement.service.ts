import { Injectable } from '@nestjs/common';
import { JournalSource, Prisma, type DepartmentGroup } from '@prisma/client';
import { ERROR_CODES, AppError, finalizeJournal, isoToday, parseIsoDate } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { SequenceService } from '../../common/sequence/sequence.module';
import { PostingService } from '../accounting/posting.service';


type SimpleLine = { accountCode: string; description: string; debit: number; credit: number; department?: DepartmentGroup | null };
function journal(memo: string, lines: SimpleLine[]) {
  return finalizeJournal(
    memo,
    lines.map((line) => ({ ...line, debit: new Prisma.Decimal(line.debit), credit: new Prisma.Decimal(line.credit) })),
  );
}


function dept(value: string): DepartmentGroup {
  const mapped = value === 'SPA' ? 'OTHER_OPERATED' : value;
  return (['ROOMS', 'FNB', 'OTHER_OPERATED', 'MISCELLANEOUS', 'UNDISTRIBUTED', 'ADMIN', 'SALES', 'PROPERTY_OPS', 'UTILITIES', 'MAINTENANCE', 'FIXED'].includes(mapped)
    ? mapped
    : 'MISCELLANEOUS') as DepartmentGroup;
}


@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly sequence: SequenceService,
    private readonly audit: AuditService,
  ) {}

  async listSuppliers(actor: AuthUser) {
    return this.prisma.supplier.findMany({ where: { orgId: actor.orgId }, orderBy: { name: 'asc' } });
  }

  async createSupplier(actor: AuthUser, input: { code: string; name: string; taxCode?: string; email?: string; phone?: string; category?: string; termsDays?: number }) {
    return this.prisma.supplier.create({
      data: { orgId: actor.orgId, code: input.code, name: input.name, taxCode: input.taxCode, email: input.email, phone: input.phone, category: input.category ?? 'GENERAL', termsDays: input.termsDays ?? 30 },
    });
  }

  async listRequests(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    return this.prisma.purchaseRequest.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async createRequest(
    actor: AuthUser,
    input: { propertyId: string; department: string; neededBy?: string; notes?: string; lines: Array<{ description: string; quantity: number; unitCost: number }> },
  ) {
    assertPropertyAccess(actor, input.propertyId);
    const total = input.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, input.propertyId, 'PURCHASE_REQUEST');
      return tx.purchaseRequest.create({
        data: {
          orgId: actor.orgId, propertyId: input.propertyId, number, department: input.department,
          neededBy: input.neededBy ? parseIsoDate(input.neededBy) : null, notes: input.notes,
          lines: input.lines as unknown as Prisma.InputJsonValue, total,
          requestedById: actor.id, status: 'SUBMITTED',
        },
      });
    });
  }

  async approveRequest(actor: AuthUser, requestId: string, supplierId: string) {
    const request = await this.prisma.purchaseRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy yêu cầu mua', 404);
    assertPropertyAccess(actor, request.propertyId);
    if (request.status === 'APPROVED' || request.status === 'ORDERED') {
      throw new AppError(ERROR_CODES.INVALID_STATE, 'Yêu cầu đã được duyệt', 409);
    }
    const lines = request.lines as Array<{ itemId?: string; description: string; quantity: number; unitCost: number }>;
    return this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, request.propertyId, 'PURCHASE_ORDER');
      const order = await tx.purchaseOrder.create({
        data: {
          orgId: actor.orgId, propertyId: request.propertyId, supplierId, number,
          status: 'ORDERED', orderDate: parseIsoDate(isoToday()),
          subtotal: request.total, vatAmount: new Prisma.Decimal(request.total).times(0.08),
          total: new Prisma.Decimal(request.total).times(1.08), createdById: actor.id,
          lines: { create: lines.map((line) => ({ itemId: line.itemId, description: line.description, quantity: line.quantity, unitCost: line.unitCost, total: line.quantity * line.unitCost })) },
        },
        include: { lines: true, supplier: true },
      });
      await tx.purchaseRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', approvedById: actor.id } });
      await this.audit.record({ orgId: actor.orgId, propertyId: request.propertyId, actorId: actor.id, actorName: actor.fullName, actorRole: actor.roles[0]?.roleCode, action: 'purchase.order_created', entityType: 'PurchaseOrder', entityId: order.id, after: { number, supplier: order.supplier.name, total: Number(order.total) } });
      return order;
    });
  }

  async listOrders(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    return this.prisma.purchaseOrder.findMany({ where: { propertyId }, include: { lines: true, supplier: true }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async receive(actor: AuthUser, orderId: string) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id: orderId }, include: { lines: true } });
    if (!order) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy đơn mua', 404);
    assertPropertyAccess(actor, order.propertyId);
    if (order.status === 'RECEIVED') throw new AppError(ERROR_CODES.INVALID_STATE, 'Đơn đã nhận hàng', 409);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, order.propertyId, 'GOODS_RECEIPT');
      const total = order.lines.reduce((sum, line) => sum + Number(line.total), 0);
      const receipt = await tx.goodsReceipt.create({
        data: { orgId: actor.orgId, propertyId: order.propertyId, purchaseOrderId: order.id, number, businessDate: parseIsoDate(isoToday()), total, createdById: actor.id,
          lines: { create: order.lines.map((line) => ({ itemId: line.itemId, description: line.description, quantity: line.quantity, unitCost: line.unitCost, total: line.total })) } },
      });
      for (const line of order.lines) {
        if (!line.itemId) continue;
        const quantity = Number(line.quantity);
        const unitCost = Number(line.unitCost);
        const existing = await tx.stockBalance.findUnique({ where: { propertyId_itemId: { propertyId: order.propertyId, itemId: line.itemId } } });
        if (existing) {
          await tx.stockBalance.update({ where: { id: existing.id }, data: { quantity: { increment: quantity }, value: { increment: quantity * unitCost } } });
        } else {
          await tx.stockBalance.create({ data: { propertyId: order.propertyId, itemId: line.itemId, quantity, value: quantity * unitCost } });
        }
        await tx.stockMovement.create({ data: { orgId: actor.orgId, propertyId: order.propertyId, itemId: line.itemId, type: 'IN', quantity, unitCost, value: quantity * unitCost, referenceType: 'GRN', referenceId: receipt.id, businessDate: parseIsoDate(isoToday()), createdById: actor.id } });
      }
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: 'RECEIVED' } });
      await tx.purchaseOrderLine.updateMany({ where: { purchaseOrderId: order.id }, data: { receivedQty: { set: 0 } } });
      const draft = journal(`Nhận hàng ${number}`, [
        { accountCode: '1520', description: `Nhập kho ${order.number}`, debit: total, credit: 0 },
        { accountCode: '3310', description: `Phải trả ${order.supplierId}`, debit: 0, credit: total },
      ]);
      const entry = await this.posting.createEntry(tx, { orgId: actor.orgId, propertyId: order.propertyId, businessDate: parseIsoDate(isoToday()), sourceType: JournalSource.EXPENSE, sourceId: receipt.id, memo: draft.memo, postedById: actor.id }, draft);
      return { id: receipt.id, number, total, entryId: entry.id };
    });
  }

  async listInvoices(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    return this.prisma.supplierInvoice.findMany({ where: { propertyId }, include: { supplier: true }, orderBy: { invoiceDate: 'desc' }, take: 100 });
  }

  async createInvoice(actor: AuthUser, input: { propertyId: string; supplierId: string; number: string; invoiceDate: string; dueDate: string; subtotal: number; vatAmount: number; accountCode: string; description: string }) {
    assertPropertyAccess(actor, input.propertyId);
    const total = input.subtotal + input.vatAmount;
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.supplierInvoice.create({
        data: { orgId: actor.orgId, propertyId: input.propertyId, supplierId: input.supplierId, number: input.number, invoiceDate: parseIsoDate(input.invoiceDate), dueDate: parseIsoDate(input.dueDate), subtotal: input.subtotal, vatAmount: input.vatAmount, total, balance: total, status: 'OPEN' },
      });
      const draft = journal(`Hoá đơn ${input.number}`, [
        { accountCode: input.accountCode, description: input.description, debit: input.subtotal, credit: 0 },
        { accountCode: '3331', description: 'VAT đầu vào', debit: input.vatAmount, credit: 0 },
        { accountCode: '3310', description: `Phải trả NCC`, debit: 0, credit: total },
      ]);
      await this.posting.createEntry(tx, { orgId: actor.orgId, propertyId: input.propertyId, businessDate: parseIsoDate(input.invoiceDate), sourceType: JournalSource.EXPENSE, sourceId: invoice.id, memo: draft.memo, postedById: actor.id }, draft);
      return invoice;
    });
  }

  async payInvoice(actor: AuthUser, invoiceId: string, method = 'BANK_TRANSFER') {
    const invoice = await this.prisma.supplierInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hoá đơn', 404);
    assertPropertyAccess(actor, invoice.propertyId);
    if (Number(invoice.balance) <= 0) throw new AppError(ERROR_CODES.INVALID_STATE, 'Hoá đơn đã thanh toán', 409);
    const account = method === 'CASH' ? '1110' : '1120';
    return this.prisma.$transaction(async (tx) => {
      await tx.supplierPayment.create({ data: { orgId: actor.orgId, propertyId: invoice.propertyId, supplierId: invoice.supplierId, supplierInvoiceId: invoice.id, amount: invoice.balance, method } });
      const draft = journal(`Thanh toán ${invoice.number}`, [
        { accountCode: '3310', description: `Trả NCC ${invoice.number}`, debit: Number(invoice.balance), credit: 0 },
        { accountCode: account, description: 'Tiền thanh toán', debit: 0, credit: Number(invoice.balance) },
      ]);
      await this.posting.createEntry(tx, { orgId: actor.orgId, propertyId: invoice.propertyId, businessDate: parseIsoDate(isoToday()), sourceType: JournalSource.PAYMENT, sourceId: invoice.id, memo: draft.memo, postedById: actor.id }, draft);
      await tx.supplierInvoice.update({ where: { id: invoice.id }, data: { paidAmount: invoice.total, balance: 0, status: 'PAID' } });
      return { id: invoice.id, paid: Number(invoice.total) };
    });
  }

  async stock(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    const balances = await this.prisma.stockBalance.findMany({ where: { propertyId }, orderBy: { updatedAt: 'desc' } });
    const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: balances.map((row) => row.itemId) } } });
    const map = new Map(items.map((item) => [item.id, item]));
    return balances.map((balance) => ({
      ...balance,
      item: map.get(balance.itemId),
      lowStock: Number(balance.quantity) <= Number(map.get(balance.itemId)?.minStock ?? 0),
    }));
  }

  async movements(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    return this.prisma.stockMovement.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async issueStock(actor: AuthUser, input: { propertyId: string; itemId: string; quantity: number; accountCode: string; department: string; notes?: string }) {
    assertPropertyAccess(actor, input.propertyId);
    const balance = await this.prisma.stockBalance.findUnique({ where: { propertyId_itemId: { propertyId: input.propertyId, itemId: input.itemId } } });
    if (!balance || Number(balance.quantity) < input.quantity) throw new AppError(ERROR_CODES.INVALID_STATE, 'Tồn kho không đủ', 409);
    const unitCost = Number(balance.value) / Math.max(1, Number(balance.quantity));
    const value = Number((unitCost * input.quantity).toFixed(2));
    return this.prisma.$transaction(async (tx) => {
      await tx.stockBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: input.quantity }, value: { decrement: value } } });
      await tx.stockMovement.create({ data: { orgId: actor.orgId, propertyId: input.propertyId, itemId: input.itemId, type: 'OUT', quantity: input.quantity, unitCost, value, referenceType: 'ISSUE', businessDate: parseIsoDate(isoToday()), notes: input.notes, createdById: actor.id } });
      const draft = journal(`Xuất kho ${input.department}`, [
        { accountCode: input.accountCode, description: input.notes ?? 'Xuất kho bộ phận', debit: value, credit: 0, department: dept(input.department) },
        { accountCode: '1520', description: 'Giảm tồn kho', debit: 0, credit: value },
      ]);
      const entry = await this.posting.createEntry(tx, { orgId: actor.orgId, propertyId: input.propertyId, businessDate: parseIsoDate(isoToday()), sourceType: JournalSource.EXPENSE, memo: draft.memo, postedById: actor.id }, draft);
      return { value, entryId: entry.id };
    });
  }

  async listExpenses(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    return this.prisma.expense.findMany({ where: { propertyId }, include: { items: { orderBy: [{ employeeName: 'asc' }, { itemDate: 'asc' }] } }, orderBy: { expenseDate: 'desc' }, take: 100 });
  }

  async createExpense(actor: AuthUser, input: { propertyId: string; accountCode: string; department: string; description: string; amount: number; vatAmount?: number; paymentMethod?: string }) {
    assertPropertyAccess(actor, input.propertyId);
    const vat = input.vatAmount ?? 0;
    const total = input.amount + vat;
    const cash = input.paymentMethod === 'CASH' ? '1110' : '1120';
    return this.prisma.$transaction(async (tx) => {
      const number = await this.sequence.next(tx, input.propertyId, 'EXPENSE');
      const expense = await tx.expense.create({ data: { orgId: actor.orgId, propertyId: input.propertyId, number, accountCode: input.accountCode, department: input.department, description: input.description, amount: input.amount, vatAmount: vat, total, status: 'PAID', expenseDate: parseIsoDate(isoToday()), paymentMethod: input.paymentMethod ?? 'BANK_TRANSFER', createdById: actor.id } });
      const draft = journal(input.description, [
        { accountCode: input.accountCode, description: input.description, debit: input.amount, credit: 0, department: dept(input.department) },
        ...(vat > 0 ? [{ accountCode: '3331', description: 'VAT đầu vào', debit: vat, credit: 0 }] : []),
        { accountCode: cash, description: 'Chi tiền', debit: 0, credit: total },
      ]);
      await this.posting.createEntry(tx, { orgId: actor.orgId, propertyId: input.propertyId, businessDate: parseIsoDate(isoToday()), sourceType: JournalSource.EXPENSE, sourceId: expense.id, memo: draft.memo, postedById: actor.id }, draft);
      return expense;
    });
  }
}
