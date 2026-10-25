import type { AuthUser } from './auth.types';
import type { PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS } from '@grand-suite/shared';

/**
 * Non-interactive actor for the public booking engine and channel webhooks.
 * The account is a real SUPER_ADMIN user so foreign keys and audit rows remain
 * valid, while the display name makes the origin explicit in the audit trail.
 */
export async function buildSystemActor(
  prisma: PrismaClient,
  orgId: string,
  displayName = 'Grand Suite · Booking Engine',
): Promise<AuthUser> {
  const user = await prisma.user.findFirst({
    where: { orgId, isActive: true, roles: { some: { role: { code: 'SUPER_ADMIN' } } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) throw new Error('Không tìm thấy tài khoản hệ thống để tạo booking công khai');
  return {
    id: user.id,
    sid: 'system',
    orgId,
    email: user.email,
    fullName: displayName,
    orgWide: true,
    roles: [{ roleCode: 'SUPER_ADMIN', propertyId: null }],
    permissions: [...ALL_PERMISSIONS],
  };
}
