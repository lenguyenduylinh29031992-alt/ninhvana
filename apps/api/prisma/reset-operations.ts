/**
 * Xoá toàn bộ dữ liệu vận hành: khách hàng, phòng, đặt phòng, POS, hoá đơn,
 * thanh toán, bút toán doanh thu/chi phí, lương, buồng phòng và audit.
 * Giữ nguyên: tổ chức, người dùng, vai trò, quyền, cấu hình, kênh, menu,
 * nhà cung cấp, mặt hàng, marketing và sơ đồ khu vực.
 *
 * Chạy: RESET_CONFIRM=YES pnpm --filter @grand-suite/api db:clear
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    try { process.loadEnvFile(path); } catch { /* ignore */ }
  }
}
if (process.env.RESET_CONFIRM !== 'YES') {
  console.error('Từ chối xoá dữ liệu. Đặt RESET_CONFIRM=YES để xác nhận.');
  process.exit(1);
}

const prisma = new PrismaClient();

  async function main() {
  const tables = [
    'Alert', 'Allotment', 'Attendance', 'AuditLog', 'CashSession', 'ChannelSyncJob', 'ChannelSyncLog',
    'Company', 'Conversation', 'ConversationMessage', 'DomainEvent', 'Expense', 'ExternalReservation',
    'Folio', 'FolioItem', 'GoodsReceipt', 'GoodsReceiptLine', 'Guest', 'GuestDocument', 'GuestPreference',
    'GuestReview', 'HousekeepingTask', 'Invoice', 'InvoiceLine', 'JournalEntry', 'JournalLine', 'KdsTicket',
    'LostAndFound', 'MaintenanceTicket', 'NightAudit', 'Notification', 'Payment', 'PayrollLine', 'PayrollRun',
    'PosOrder', 'PosOrderItem', 'PosPayment', 'PurchaseOrder', 'PurchaseOrderLine', 'PurchaseRequest',
    'Refund', 'Reservation', 'ReservationNight', 'ReservationRoom', 'Room', 'RoomStatusLog', 'ServiceRequest',
    'StockBalance', 'StockMovement', 'SupplierInvoice', 'SupplierPayment', 'TableReservation',
  ];

  try {
    const quoted = tables.map((table) => `"${table}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
    await prisma.property.updateMany({ data: { roomCount: 0 } });
    await prisma.numberSequence.updateMany({ data: { nextValue: 1 } });
    const [guests, rooms, reservations, journalLines] = await Promise.all([
      prisma.guest.count(), prisma.room.count(), prisma.reservation.count(), prisma.journalLine.count(),
    ]);
    console.info(`✓ Đã xoá dữ liệu vận hành: khách=${guests}, phòng=${rooms}, đặt phòng=${reservations}, bút toán=${journalLines}`);
    console.info('✓ Đã đặt lại số phòng của cơ sở và bộ đếm chứng từ về 0/1.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
