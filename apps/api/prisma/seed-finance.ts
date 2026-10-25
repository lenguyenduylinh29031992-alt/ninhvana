import { PrismaClient, Prisma } from '@prisma/client';
import { calculatePayroll } from '@grand-suite/shared';

const prisma = new PrismaClient();
const money = (value: number) => new Prisma.Decimal(value.toFixed(2));

const EMPLOYEES: Array<[string, string, string, string, string, number, number, number]> = [
  ['EMP-001', 'Nguyễn Văn Minh', 'Tổng quản lý', 'ADMIN', 'GENERAL_MANAGER', 55_000_000, 8_000_000, 2],
  ['EMP-002', 'Trần Thị Hồng', 'Kế toán trưởng', 'ADMIN', 'FINANCE_MANAGER', 35_000_000, 4_000_000, 1],
  ['EMP-003', 'Lê Quốc Bảo', 'Trưởng lễ tân', 'ROOMS', 'FRONT_OFFICE_MANAGER', 22_000_000, 2_000_000, 1],
  ['EMP-004', 'Phạm Thu Trang', 'Lễ tân', 'ROOMS', 'RECEPTIONIST', 12_000_000, 1_000_000, 0],
  ['EMP-005', 'Hoàng Minh Tuấn', 'Lễ tân', 'ROOMS', 'RECEPTIONIST', 12_000_000, 1_000_000, 0],
  ['EMP-006', 'Vũ Thị Mai', 'Buồng phòng', 'ROOMS', 'HOUSEKEEPER', 9_000_000, 500_000, 1],
  ['EMP-007', 'Đỗ Văn Hùng', 'Giám đốc F&B', 'FNB', 'FNB_DIRECTOR', 32_000_000, 3_000_000, 2],
  ['EMP-008', 'Ngô Thị Lan', 'Bếp trưởng', 'FNB', 'EXECUTIVE_CHEF', 28_000_000, 2_000_000, 1],
  ['EMP-009', 'Bùi Văn Nam', 'Đầu bếp', 'FNB', 'CHEF_DE_PARTIE', 16_000_000, 1_000_000, 0],
  ['EMP-010', 'Dương Thị Hạnh', 'Phục vụ', 'FNB', 'WAITER', 9_500_000, 500_000, 0],
  ['EMP-011', 'Trịnh Văn Sơn', 'Phục vụ', 'FNB', 'WAITER', 9_500_000, 500_000, 0],
  ['EMP-012', 'Lý Thị Ngọc', 'Barista', 'FNB', 'BARTENDER', 11_000_000, 800_000, 0],
  ['EMP-013', 'Phan Văn Dũng', 'Kỹ thuật', 'ENGINEERING', 'TECHNICIAN', 14_000_000, 1_000_000, 1],
  ['EMP-014', 'Đinh Thị Thu', 'Spa therapist', 'SPA', 'THERAPIST', 13_000_000, 1_500_000, 0],
  ['EMP-015', 'Tạ Văn Long', 'Bảo vệ', 'ADMIN', 'SECURITY', 9_000_000, 500_000, 0],
  ['EMP-016', 'Nguyễn Thị Hoa', 'Sales manager', 'ADMIN', 'SALES_MANAGER', 26_000_000, 3_000_000, 1],
  ['EMP-017', 'Trần Văn Kiên', 'Marketing', 'ADMIN', 'MARKETING_EXECUTIVE', 16_000_000, 1_000_000, 0],
  ['EMP-018', 'Lê Thị Bích', 'Buồng phòng', 'ROOMS', 'HOUSEKEEPER', 8_500_000, 500_000, 1],
];

const SUPPLIERS: Array<[string, string, string, string, string]> = [
  ['SUP-001', 'Công ty Điện lực Hà Nội', 'EVN', 'UTILITIES', '0100100001'],
  ['SUP-002', 'Công ty Nước sạch Hà Nội', 'WATER', 'UTILITIES', '0100100002'],
  ['SUP-003', 'Công ty Thực phẩm Minh Anh', 'FOOD', 'FNB', '0100100003'],
  ['SUP-004', 'Công ty Đồ uống Sài Gòn', 'BEVERAGE', 'FNB', '0100100004'],
  ['SUP-005', 'Công ty Vệ sinh ProClean', 'CLEANING', 'HOUSEKEEPING', '0100100005'],
  ['SUP-006', 'Công ty Quảng cáo Sao Việt', 'MEDIA', 'MARKETING', '0100100006'],
  ['SUP-007', 'Công ty Điều hoà Bảo Tín', 'HVAC', 'MAINTENANCE', '0100100007'],
  ['SUP-008', 'Công ty Văn phòng phẩm Hồng Hà', 'OFFICE', 'ADMIN', '0100100008'],
];

const ITEMS: Array<[string, string, string, string, number, number]> = [
  ['ITM-001', 'Thịt bò Úc', 'kg', 'FOOD', 50, 420_000],
  ['ITM-002', 'Cá hồi Na Uy', 'kg', 'FOOD', 30, 580_000],
  ['ITM-003', 'Tôm sú', 'kg', 'FOOD', 25, 360_000],
  ['ITM-004', 'Gạo Nhật', 'kg', 'FOOD', 100, 45_000],
  ['ITM-005', 'Rau củ hữu cơ', 'kg', 'FOOD', 80, 38_000],
  ['ITM-006', 'Rượu vang Pháp', 'chai', 'BEVERAGE', 60, 520_000],
  ['ITM-007', 'Cà phê Arabica', 'kg', 'BEVERAGE', 40, 280_000],
  ['ITM-008', 'Bia craft', 'chai', 'BEVERAGE', 200, 55_000],
  ['ITM-009', 'Dầu ăn cao cấp', 'lít', 'FOOD', 50, 95_000],
  ['ITM-010', 'Bột mì', 'kg', 'FOOD', 80, 32_000],
];

async function journal(entry: {
  orgId: string; propertyId: string; businessDate: string; sourceType: string; memo: string;
  lines: Array<{ accountCode: string; description: string; debit: number; credit: number; department?: string | null }>;
}) {
  const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`unbalanced ${entry.memo}: ${totalDebit}/${totalCredit}`);
  const created = await prisma.journalEntry.create({
    data: {
      orgId: entry.orgId, propertyId: entry.propertyId,
      businessDate: new Date(`${entry.businessDate}T00:00:00Z`),
      number: `FIN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sourceType: entry.sourceType as never, memo: entry.memo,
      totalDebit: money(totalDebit), totalCredit: money(totalCredit),
      lines: { create: entry.lines.map((line) => ({
        accountCode: line.accountCode, description: line.description,
        debit: money(line.debit), credit: money(line.credit),
        department: line.department ? (line.department as never) : null,
      })) },
    },
  });
  return created;
}

async function main() {
  const properties = await prisma.property.findMany({ where: { type: 'HOTEL', isActive: true } });
  if (properties.length === 0) throw new Error('No hotel property — run base seed first');
  const orgId = properties[0]!.orgId;
  const today = new Date().toISOString().slice(0, 10);
  const currentPeriod = today.slice(0, 7);
  const previousDate = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1));
  const previousPeriod = previousDate.toISOString().slice(0, 7);

  const suppliers = new Map<string, { id: string; name: string }>();
  for (const [code, name, , , taxCode] of SUPPLIERS) {
    const supplier = await prisma.supplier.upsert({
      where: { orgId_code: { orgId, code: code! } },
      update: { name: name! },
      create: { orgId, code: code!, name: name!, taxCode, category: 'SUPPLIER' },
    });
    suppliers.set(code!, supplier);
  }

  const items: Array<{ id: string; code: string; unitCost: number }> = [];
  for (const [code, name, unit, category, minStock, unitCost] of ITEMS) {
    await prisma.inventoryItem.upsert({
      where: { orgId_code: { orgId, code: code! } },
      update: { name: name! },
      create: { orgId, code: code!, name: name!, unit: unit!, category: category!, minStock: minStock!, unitCost: unitCost! },
    });
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { orgId_code: { orgId, code: code! } } });
    items.push({ id: item.id, code: item.code, unitCost: Number(item.unitCost) });
  }

  for (const property of properties) {
    // Opening inventory & capital, once.
    const opening = await prisma.stockMovement.findFirst({ where: { propertyId: property.id, type: 'OPENING' } });
    if (!opening) {
      const value = items.reduce((sum, item) => sum + item.unitCost * 500, 0);
      for (const item of items) {
        await prisma.stockBalance.upsert({
          where: { propertyId_itemId: { propertyId: property.id, itemId: item.id } },
          update: {},
          create: { propertyId: property.id, itemId: item.id, quantity: 500, value: item.unitCost * 500 },
        });
        await prisma.stockMovement.create({ data: { orgId, propertyId: property.id, itemId: item.id, type: 'OPENING', quantity: 500, unitCost: item.unitCost, value: item.unitCost * 500, businessDate: new Date(`${today}T00:00:00Z`) } });
      }
      await journal({ orgId, propertyId: property.id, businessDate: today, sourceType: 'OPENING', memo: 'Tồn kho đầu kỳ', lines: [
        { accountCode: '1520', description: 'Nguyên liệu đầu kỳ', debit: value, credit: 0 },
        { accountCode: '4110', description: 'Vốn chủ sở hữu', debit: 0, credit: value },
      ] });
    }

    // Employees and attendance for the current month.
    const employees = [];
    for (const [code, fullName, position, department, , baseSalary, allowances, dependents] of EMPLOYEES) {
      const employee = await prisma.employee.upsert({
        where: { orgId_code: { orgId, code: code! } },
        update: { baseSalary: baseSalary!, allowances: allowances! },
        create: { orgId, propertyId: property.id, code: code!, fullName: fullName!, position: position!, department: department!, hireDate: new Date('2023-01-15T00:00:00Z'), baseSalary: baseSalary!, allowances: allowances!, dependents: dependents! },
      });
      employees.push(employee);
      for (let day = 1; day <= 22; day += 1) {
        const date = new Date(Date.UTC(Number(currentPeriod.slice(0, 4)), Number(currentPeriod.slice(5, 7)) - 1, day));
        await prisma.attendance.upsert({
          where: { employeeId_date: { employeeId: employee.id, date } },
          update: {},
          create: { employeeId: employee.id, date, hours: 8, overtimeHours: day % 7 === 0 ? 2 : 0, status: 'PRESENT' },
        });
      }
    }

    // Monthly payroll: previous month paid, current month posted.
    for (const [period, status] of [[previousPeriod, 'PAID'], [currentPeriod, 'POSTED']] as const) {
      const existing = await prisma.payrollRun.findUnique({ where: { propertyId_period: { propertyId: property.id, period } } });
      if (existing) continue;
      let gross = 0; let employer = 0; let net = 0; let employeeInsurance = 0; let union = 0; let tax = 0;
      const lines = employees.map((employee) => {
        const result = calculatePayroll({ baseSalary: Number(employee.baseSalary), allowances: Number(employee.allowances), overtimeHours: 6, dependents: employee.dependents });
        gross += result.gross; employer += result.insuranceEmployer; net += result.net;
        employeeInsurance += result.insuranceEmployee; union += result.unionFee; tax += result.tax;
        return { employeeId: employee.id, employeeCode: employee.code, employeeName: employee.fullName, department: employee.department, baseSalary: money(result.baseSalary), allowances: money(result.allowances), overtimePay: money(result.overtimePay), gross: money(result.gross), insuranceEmployee: money(result.insuranceEmployee), unionFee: money(result.unionFee), tax: money(result.tax), net: money(result.net), insuranceEmployer: money(result.insuranceEmployer), totalCost: money(result.totalCost) };
      });
      const run = await prisma.payrollRun.create({ data: { orgId, propertyId: property.id, period, status, gross, employeeCost: gross + employer, deductions: employeeInsurance + union + tax, net, postedAt: status === 'POSTED' || status === 'PAID' ? new Date() : null, paidAt: status === 'PAID' ? new Date() : null, lines: { create: lines } } });
      const rounding = Number((gross + employer - (net + employeeInsurance + union + employer + tax)).toFixed(2));
      const entry = await journal({ orgId, propertyId: property.id, businessDate: period === currentPeriod ? today : `${period}-28`, sourceType: 'PAYROLL', memo: `Lương kỳ ${period}`, lines: [
        { accountCode: '6000', description: 'Lương & phụ cấp', debit: gross, credit: 0 },
        { accountCode: '6010', description: 'Bảo hiểm người sử dụng lao động', debit: employer, credit: 0 },
        { accountCode: '3340', description: 'Phải trả người lao động', debit: 0, credit: net },
        { accountCode: '3380', description: 'BHXH/BHYT/BHTN/KPCĐ', debit: 0, credit: employeeInsurance + union + employer + rounding },
        { accountCode: '3335', description: 'Thuế TNCN', debit: 0, credit: tax },
      ] });
      await prisma.payrollRun.update({ where: { id: run.id }, data: { postedEntryId: entry.id } });
      if (status === 'PAID') {
        await journal({ orgId, propertyId: property.id, businessDate: `${period}-28`, sourceType: 'PAYMENT', memo: `Chi lương kỳ ${period}`, lines: [
          { accountCode: '3340', description: 'Chi lương', debit: net, credit: 0 },
          { accountCode: '1120', description: 'Chuyển khoản lương', debit: 0, credit: net },
        ] });
      }
    }

    // Service supplier invoices, partly paid, across two periods.
    const bills: Array<[string, string, number, string]> = [
      ['SUP-001', '6100', 185_000_000, 'Tiền điện'],
      ['SUP-002', '6110', 38_000_000, 'Tiền nước'],
      ['SUP-005', '5200', 42_000_000, 'Hoá chất vệ sinh'],
      ['SUP-006', '6200', 120_000_000, 'Quảng cáo & truyền thông'],
      ['SUP-007', '6300', 55_000_000, 'Bảo trì điều hoà'],
      ['SUP-008', '6400', 18_000_000, 'Văn phòng phẩm'],
    ];
    for (const [period, date] of [[previousPeriod, `${previousPeriod}-28`], [currentPeriod, `${currentPeriod}-20`]] as const) {
      for (const [supplierCode, accountCode, amount, description] of bills) {
        const supplier = suppliers.get(supplierCode)!;
        const number = `SI-${period}-${supplierCode}`;
        const exists = await prisma.supplierInvoice.findUnique({ where: { supplierId_number: { supplierId: supplier.id, number } } });
        if (exists) continue;
        const invoiceDate = new Date(`${date}T00:00:00Z`);
        const dueDate = new Date(invoiceDate); dueDate.setUTCDate(dueDate.getUTCDate() + 30);
        const invoice = await prisma.supplierInvoice.create({ data: { orgId, propertyId: property.id, supplierId: supplier.id, number, invoiceDate, dueDate, subtotal: amount, vatAmount: 0, total: amount, balance: amount, status: 'OPEN' } });
        await journal({ orgId, propertyId: property.id, businessDate: date, sourceType: 'EXPENSE', memo: `${description} ${period}`, lines: [
          { accountCode, description, debit: amount, credit: 0, department: accountCode === '5200' ? 'FNB' : null },
          { accountCode: '3310', description: 'Phải trả nhà cung cấp', debit: 0, credit: amount },
        ] });
        if (period === previousPeriod && Number(invoice.balance) > 0) {
          await journal({ orgId, propertyId: property.id, businessDate: `${period}-28`, sourceType: 'PAYMENT', memo: `Thanh toán ${number}`, lines: [
            { accountCode: '3310', description: 'Trả nhà cung cấp', debit: amount, credit: 0 },
            { accountCode: '1120', description: 'Chuyển khoản', debit: 0, credit: amount },
          ] });
          await prisma.supplierInvoice.update({ where: { id: invoice.id }, data: { paidAmount: amount, balance: 0, status: 'PAID' } });
          await prisma.supplierPayment.create({ data: { orgId, propertyId: property.id, supplierId: supplier.id, supplierInvoiceId: invoice.id, amount, method: 'BANK_TRANSFER' } });
        }
      }
    }

    // Rent and property insurance (fixed charges) for both months.
    for (const period of [previousPeriod, currentPeriod]) {
      const marker = `FIN-RENT-${property.id}-${period}`;
      const exists = await prisma.journalEntry.findFirst({ where: { propertyId: property.id, memo: marker } });
      if (exists) continue;
      await journal({ orgId, propertyId: property.id, businessDate: `${period}-01`, sourceType: 'EXPENSE', memo: marker, lines: [
        { accountCode: '6410', description: 'Thuê mặt bằng', debit: 450_000_000, credit: 0 },
        { accountCode: '6420', description: 'Bảo hiểm tài sản', debit: 45_000_000, credit: 0 },
        { accountCode: '3310', description: 'Phải trả nhà cung cấp', debit: 0, credit: 495_000_000 },
      ] });
    }

    // Weekly inventory issues to F&B cost of sales.
    for (let week = 0; week < 4; week += 1) {
      const date = `${currentPeriod}-${String(3 + week * 7).padStart(2, '0')}`;
      const marker = `FIN-ISSUE-${property.id}-${week}`;
      const exists = await prisma.stockMovement.findFirst({ where: { propertyId: property.id, referenceType: marker } });
      if (exists) continue;
      let remaining = 70_000_000;
      for (const item of items.slice(0, 4)) {
        const quantity = Math.min(50, remaining / item.unitCost);
        const balance = await prisma.stockBalance.findUnique({ where: { propertyId_itemId: { propertyId: property.id, itemId: item.id } } });
        if (!balance || Number(balance.quantity) < quantity) continue;
        const value = Number((quantity * item.unitCost).toFixed(2));
        await prisma.stockBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: quantity }, value: { decrement: value } } });
        await prisma.stockMovement.create({ data: { orgId, propertyId: property.id, itemId: item.id, type: 'OUT', quantity, unitCost: item.unitCost, value, referenceType: marker, businessDate: new Date(`${date}T00:00:00Z`) } });
        remaining -= value;
      }
      await journal({ orgId, propertyId: property.id, businessDate: date, sourceType: 'EXPENSE', memo: marker, lines: [
        { accountCode: '5000', description: 'Giá vốn F&B', debit: 70_000_000, credit: 0, department: 'FNB' },
        { accountCode: '1520', description: 'Xuất kho nguyên liệu', debit: 0, credit: 70_000_000 },
      ] });
    }
  }


  // CRM reviews and campaigns (idempotent by emptiness).
  if ((await prisma.guestReview.count({ where: { orgId } })) === 0) {
    const guests = await prisma.guest.findMany({ where: { orgId }, take: 24, orderBy: { createdAt: 'asc' } });
    const comments = [
      ['Tuyệt vời từ phòng đến dịch vụ', 5], ['Bữa sáng rất phong phú', 5], ['Nhân viên thân thiện', 4],
      ['Phòng sạch, view đẹp', 5], ['Hơi ồn vào buổi tối', 3], ['Spa rất đáng tiền', 5],
      ['Check-in nhanh', 4], ['Giá hơi cao so với chất lượng', 3], ['Sẽ quay lại', 5], ['Vị trí thuận tiện', 4],
    ] as const;
    for (const [index, guest] of guests.entries()) {
      const [comment, rating] = comments[index % comments.length]!;
      await prisma.guestReview.create({ data: { orgId, propertyId: properties[index % properties.length]!.id, guestId: guest.id, rating, cleanliness: rating, service: Math.min(5, rating + (index % 2)), location: 5, value: Math.max(3, rating - 1), title: comment, comment, status: index % 3 === 0 ? 'RESPONDED' : 'NEW', response: index % 3 === 0 ? 'Cảm ơn quý khách đã chia sẻ trải nghiệm.' : null, reviewDate: new Date(Date.now() - index * 86_400_000) } });
    }
  }
  if ((await prisma.campaign.count({ where: { orgId } })) === 0) {
    for (const [name, segment, subject] of [
      ['Ưu đãi cuối tuần cho khách VIP', 'VIP', 'Đặc quyền cuối tuần tại Grand Suite'],
      ['Mời khách quay lại', 'LAPSED', 'Chúng tôi nhớ quý khách'],
      ['Ưu đãi spa tháng 11', 'REPEAT', 'Thư giãn cùng Grand Spa'],
      ['Bản tin sự kiện', 'ALL', 'Sự kiện ẩm thực tháng này'],
    ] as const) {
      await prisma.campaign.create({ data: { orgId, name, segment, subject, channel: 'EMAIL', body: 'Kính gửi quý khách, Grand Suite trân trọng gửi tới quý khách ưu đãi đặc biệt.', status: 'DRAFT' } });
    }
  }

  const counts = {
    employees: await prisma.employee.count({ where: { orgId } }),
    suppliers: await prisma.supplier.count({ where: { orgId } }),
    items: await prisma.inventoryItem.count({ where: { orgId } }),
    payrollRuns: await prisma.payrollRun.count({ where: { orgId } }),
    supplierInvoices: await prisma.supplierInvoice.count({ where: { orgId } }),
  };
  console.info('finance seed complete', counts);
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(() => prisma.$disconnect());
