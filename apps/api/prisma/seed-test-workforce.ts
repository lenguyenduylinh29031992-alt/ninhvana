import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/auth/password';

const prisma = new PrismaClient();
const PASSWORD = process.env.TEST_WORKFORCE_PASSWORD || 'NinhVaNa@2026';
const OFFICIAL_ROLE: Record<string, string> = {
  FRONT_OFFICE: 'FRONT_DESK',
  FRONTDESK: 'FRONT_DESK',
  RECEPTION: 'FRONT_DESK',
  HOUSEKEEPING: 'HOUSEKEEPING',
  FNB: 'CASHIER',
  FB: 'CASHIER',
  KITCHEN: 'CASHIER',
  HR: 'HR_MANAGER',
  SALES: 'MARKETING',
  MARKETING: 'MARKETING',
  WAREHOUSE: 'WAREHOUSE',
  MAINTENANCE: 'HOUSEKEEPING',
};

async function main() {
  const org = await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  const property = await prisma.property.findFirstOrThrow({ where: { orgId: org.id }, orderBy: { createdAt: 'asc' } });
  const departments = await prisma.department.findMany({ where: { propertyId: property.id, isActive: true }, orderBy: { code: 'asc' } });
  const roles = await prisma.role.findMany({ where: { code: { in: ['DEPARTMENT_HEAD', 'PROBATION', ...Object.values(OFFICIAL_ROLE)] } } });
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  const passwordHash = await hashPassword(PASSWORD);
  let created = 0;
  for (const department of departments) {
    const officialEmail = `official.${department.code.toLowerCase()}@ninhvana.vn`;
    const probationEmail = `probation.${department.code.toLowerCase()}@ninhvana.vn`;
    const headEmail = `head.${department.code.toLowerCase()}@ninhvana.vn`;
    const officialRoleCode = OFFICIAL_ROLE[department.code] ?? 'HOUSEKEEPING';
    const officialRole = roleByCode.get(officialRoleCode) ?? roleByCode.get('HOUSEKEEPING');
    const probationRole = roleByCode.get('PROBATION');
    const headRole = roleByCode.get('DEPARTMENT_HEAD');
    if (!officialRole || !probationRole || !headRole) throw new Error('Thiếu role DEPARTMENT_HEAD/PROBATION; chạy migration trước');

    for (const [email, fullName, code, status, role] of [
      [headEmail, `Trưởng ${department.name}`, `HEAD-${department.code}`, 'ACTIVE', headRole],
      [officialEmail, `Nhân viên ${department.name}`, `OFF-${department.code}`, 'ACTIVE', officialRole],
      [probationEmail, `Thử việc ${department.name}`, `PRO-${department.code}`, 'PROBATION', probationRole],
    ] as const) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      const existingEmployee = await prisma.employee.findFirst({ where: { orgId: org.id, code } });
      if (existingUser && existingEmployee) continue;
      await prisma.$transaction(async (tx) => {
        const user = existingUser ?? await tx.user.create({ data: { orgId: org.id, email, fullName, departmentCode: department.code, passwordHash, isActive: true, mustChangePassword: false, roles: { create: { roleId: role.id, propertyId: property.id, isPrimary: true } } } });
        if (!existingEmployee) await tx.employee.create({ data: { orgId: org.id, propertyId: property.id, code, fullName, position: role.code === 'DEPARTMENT_HEAD' ? 'Trưởng bộ phận' : status === 'PROBATION' ? 'Nhân viên thử việc' : 'Nhân viên', department: department.code, hireDate: new Date('2026-10-01T00:00:00Z'), baseSalary: status === 'PROBATION' ? 5500000 : 6500000, status, email, phone: null } });
        void user;
      });
      created += 1;
    }
  }
  console.info(JSON.stringify({ departments: departments.length, created, password: PASSWORD }));
}

main().finally(() => prisma.$disconnect());
