import { Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@grand-suite/shared';
import { PrismaService } from '../../common/prisma/prisma.module';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';

const RELEASE_AT = new Date('2026-10-26T00:00:00Z');

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, unreadOnly = false) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        severity: item.severity,
        link: item.link,
        data: item.data,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      unread,
    };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: result.count };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true, updated: result.count };
  }

  async badges(actor: AuthUser, propertyId?: string) {
    if (propertyId) assertPropertyAccess(actor, propertyId);
    const reads = await this.prisma.userSectionRead.findMany({ where: { userId: actor.id }, select: { section: true, readAt: true } });
    const readAt = new Map(reads.map((row) => [row.section, row.readAt]));
    const can = (permission: string) => actor.permissions.includes(permission);
    const after = (section: string) => readAt.get(section);
    const scopedProperty = propertyId ? { propertyId } : {};
    const counts: Record<string, number> = {};

    if (can(PERMISSIONS.RESERVATION_VIEW)) {
      const reservationsSince = after('/reservations');
      const frontDeskSince = after('/front-desk');
      counts['/reservations'] = reservationsSince ? await this.prisma.reservation.count({ where: { ...scopedProperty, updatedAt: { gt: reservationsSince } } }) : 0;
      counts['/front-desk'] = frontDeskSince ? await this.prisma.reservation.count({ where: { ...scopedProperty, updatedAt: { gt: frontDeskSince } } }) : 0;
    }
    if (can(PERMISSIONS.GUEST_VIEW)) {
      const since = after('/guests');
      counts['/guests'] = since ? await this.prisma.guest.count({ where: { orgId: actor.orgId, updatedAt: { gt: since } } }) : 0;
    }
    if (can(PERMISSIONS.HOUSEKEEPING_VIEW)) {
      const since = after('/housekeeping');
      counts['/housekeeping'] = since ? await this.prisma.housekeepingTask.count({ where: { ...scopedProperty, updatedAt: { gt: since } } }) : 0;
    }
    if (can(PERMISSIONS.REVIEW_VIEW)) {
      const since = after('/reviews');
      counts['/reviews'] = since ? await this.prisma.guestReview.count({ where: { ...scopedProperty, createdAt: { gt: since } } }) : 0;
    }
    if (can(PERMISSIONS.INBOX_VIEW)) {
      const since = after('/inbox');
      counts['/inbox'] = since ? await this.prisma.conversation.count({ where: { orgId: actor.orgId, updatedAt: { gt: since } } }) : 0;
    }
    if (can(PERMISSIONS.MARKETING_VIEW)) {
      const since = after('/marketing');
      counts['/marketing'] = since ? await this.prisma.marketingItem.count({ where: { orgId: actor.orgId, updatedAt: { gt: since } } }) : 0;
    }
    if (can(PERMISSIONS.PAYROLL_VIEW)) {
      const since = after('/hr');
      counts['/hr'] = since ? await this.prisma.employee.count({ where: { orgId: actor.orgId, createdAt: { gt: since } } }) : 0;
    }
    if (can(PERMISSIONS.EXPENSE_VIEW)) {
      const since = after('/costs');
      counts['/costs'] = since ? await this.prisma.expense.count({ where: { ...scopedProperty, createdAt: { gt: since } } }) : 0;
    }
    if (can(PERMISSIONS.RATE_UPDATE)) {
      counts['/rate-approvals'] = await this.prisma.rateChangeRequest.count({ where: { ...scopedProperty, status: 'PENDING' } });
    }
    const releaseSeen = after('/updates');
    if (!releaseSeen || releaseSeen < RELEASE_AT) counts['/updates'] = 1;
    return { badges: counts };
  }

  async markSectionRead(actor: AuthUser, section: string) {
    const normalized = section.length > 120 ? section.slice(0, 120) : section;
    const now = new Date();
    await this.prisma.userSectionRead.upsert({
      where: { userId_section: { userId: actor.id, section: normalized } },
      update: { readAt: now },
      create: { userId: actor.id, section: normalized, readAt: now },
    });
    return { ok: true, section: normalized };
  }

  async markAllSectionsRead(actor: AuthUser) {
    const sections = ['/reservations', '/front-desk', '/guests', '/housekeeping', '/reviews', '/inbox', '/marketing', '/hr', '/costs', '/rate-approvals', '/updates'];
    const now = new Date();
    await this.prisma.$transaction(sections.map((section) => this.prisma.userSectionRead.upsert({
      where: { userId_section: { userId: actor.id, section } },
      update: { readAt: now },
      create: { userId: actor.id, section, readAt: now },
    })));
    return { ok: true };
  }
}
