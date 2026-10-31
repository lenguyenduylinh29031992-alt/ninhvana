/* eslint-disable @typescript-eslint/no-require-imports */
/* One-off test workforce seed; run inside the API container after migrations. */
const { PrismaClient } = require('@prisma/client');
const { hash, Algorithm } = require('@node-rs/argon2');
const prisma = new PrismaClient();
const PASSWORD = process.env.TEST_WORKFORCE_PASSWORD || 'NinhVaNa@2026';
const OFFICIAL_ROLE = { FRONT_OFFICE: 'FRONT_DESK', FRONTDESK: 'FRONT_DESK', RECEPTION: 'FRONT_DESK', HOUSEKEEPING: 'HOUSEKEEPING', FNB: 'CASHIER', FB: 'CASHIER', KITCHEN: 'CASHIER', HR: 'HR_STAFF', SALES: 'MARKETING', MARKETING: 'MARKETING', WAREHOUSE: 'WAREHOUSE', MAINTENANCE: 'HOUSEKEEPING' };
(async () => {
  const org = await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const property = await prisma.property.findFirstOrThrow({ where: { orgId: org.id }, orderBy: { createdAt: 'asc' } });
  const departments = await prisma.department.findMany({ where: { propertyId: property.id, isActive: true }, orderBy: { code: 'asc' } });
  const roles = await prisma.role.findMany({ where: { code: { in: ['DEPARTMENT_HEAD', 'PROBATION', ...Object.values(OFFICIAL_ROLE)] } } });
  const byCode = new Map(roles.map((role) => [role.code, role]));
  const passwordHash = await hash(PASSWORD, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  let created = 0;
  for (const department of departments) {
    const officialRole = byCode.get(OFFICIAL_ROLE[department.code] || 'HOUSEKEEPING') || byCode.get('HOUSEKEEPING');
    const probationRole = byCode.get('PROBATION');
    const headRole = byCode.get('DEPARTMENT_HEAD');
    if (!officialRole || !probationRole || !headRole) throw new Error('Missing DEPARTMENT_HEAD/PROBATION role');
    const records = [
      [`head.${department.code.toLowerCase()}@ninhvana.vn`, `Trưởng ${department.name}`, `HEAD-${department.code}`, 'ACTIVE', headRole, 7500000, 'Trưởng bộ phận'],
      [`official.${department.code.toLowerCase()}@ninhvana.vn`, `Nhân viên ${department.name}`, `OFF-${department.code}`, 'ACTIVE', officialRole, 6500000, 'Nhân viên'],
      [`probation.${department.code.toLowerCase()}@ninhvana.vn`, `Thử việc ${department.name}`, `PRO-${department.code}`, 'PROBATION', probationRole, 5500000, 'Nhân viên thử việc'],
    ];
    for (const [email, fullName, code, status, role, baseSalary, position] of records) {
      if (await prisma.user.findUnique({ where: { email } })) continue;
      await prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { orgId: org.id, email, fullName, departmentCode: department.code, passwordHash, isActive: true, mustChangePassword: false, roles: { create: { roleId: role.id, propertyId: property.id, isPrimary: true } } } });
        if (!(await tx.employee.findFirst({ where: { orgId: org.id, code } }))) {
          await tx.employee.create({ data: { orgId: org.id, propertyId: property.id, code, fullName, position, department: department.code, hireDate: new Date('2026-10-01T00:00:00Z'), baseSalary, status, email } });
        }
      });
      created += 1;
    }
  }
  console.info(JSON.stringify({ departments: departments.length, created, password: PASSWORD }));
})().finally(() => prisma.$disconnect());
