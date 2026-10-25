import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedOperations } from './seed-operations';

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

async function main() {
  const org = await prisma.organization.findFirstOrThrow();
  const properties = await prisma.property.findMany({ where: { orgId: org.id }, select: { id: true, code: true } });
  const result = await seedOperations(prisma, org.id, new Map(properties.map((p) => [p.code, p.id])));
  console.info('operations seeded:', result);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
