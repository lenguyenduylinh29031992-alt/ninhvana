import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) { try { process.loadEnvFile(path); } catch { /* ignore */ } }
}
const prisma = new PrismaClient();
async function main() {
  const org = await prisma.organization.findFirstOrThrow();
  const root = await prisma.marketingItem.upsert({
    where: { id: 'mkt-tiktok-root' },
    update: { title: 'Kênh TikTok', description: 'Kênh TikTok: lịch đăng, video ngắn, TikTok Shop và hợp tác KOL.', status: 'IN_PROGRESS', channel: 'TikTok' },
    create: { id: 'mkt-tiktok-root', orgId: org.id, title: 'Kênh TikTok', description: 'Kênh TikTok: lịch đăng, video ngắn, TikTok Shop và hợp tác KOL.', status: 'IN_PROGRESS', channel: 'TikTok', sortOrder: 6 },
  });
  for (const [index, title] of ['Lịch đăng TikTok', 'Video ngắn', 'TikTok Shop', 'KOL TikTok'].entries()) {
    await prisma.marketingItem.upsert({
      where: { id: `mkt-tiktok-${index + 1}` },
      update: { title, parentId: root.id, channel: 'TikTok' },
      create: { id: `mkt-tiktok-${index + 1}`, orgId: org.id, parentId: root.id, title, status: 'PLANNED', channel: 'TikTok', sortOrder: index + 1 },
    });
  }
  console.info('TikTok marketing ready');
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
