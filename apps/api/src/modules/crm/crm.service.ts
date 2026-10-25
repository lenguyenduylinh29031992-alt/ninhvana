import { Injectable } from '@nestjs/common';
import { ERROR_CODES, AppError, isoToday, parseIsoDate } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async segments(actor: AuthUser) {
    const guests = await this.prisma.guest.findMany({ where: { orgId: actor.orgId } });
    const lapsedBefore = new Date(`${isoToday().slice(0, 4)}-${isoToday().slice(5, 7)}-01`);
    lapsedBefore.setUTCMonth(lapsedBefore.getUTCMonth() - 6);
    const vip = guests.filter((guest) => guest.vipLevel > 0);
    const repeat = guests.filter((guest) => guest.totalStays > 1);
    const lapsed = guests.filter((guest) => guest.lastStayAt && guest.lastStayAt < lapsedBefore);
    return {
      total: guests.length,
      segments: [
        { key: 'ALL', label: 'Toàn bộ khách', count: guests.length, value: guests.reduce((sum, guest) => sum + Number(guest.lifetimeValue), 0) },
        { key: 'VIP', label: 'VIP / Loyalty', count: vip.length, value: vip.reduce((sum, guest) => sum + Number(guest.lifetimeValue), 0) },
        { key: 'REPEAT', label: 'Quay lại', count: repeat.length, value: repeat.reduce((sum, guest) => sum + Number(guest.lifetimeValue), 0) },
        { key: 'LAPSED', label: 'Không quay lại 6 tháng', count: lapsed.length, value: lapsed.reduce((sum, guest) => sum + Number(guest.lifetimeValue), 0) },
      ],
      topGuests: [...guests].sort((a, b) => Number(b.lifetimeValue) - Number(a.lifetimeValue)).slice(0, 10).map((guest) => ({
        id: guest.id, code: guest.code, fullName: guest.fullName, vipLevel: guest.vipLevel,
        stays: guest.totalStays, lifetimeValue: Number(guest.lifetimeValue), lastStayAt: guest.lastStayAt?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  async reviews(actor: AuthUser, propertyId?: string) {
    const reviews = await this.prisma.guestReview.findMany({
      where: { orgId: actor.orgId, ...(propertyId ? { propertyId } : {}) },
      orderBy: { reviewDate: 'desc' }, take: 100,
    });
    const guests = await this.prisma.guest.findMany({ where: { id: { in: reviews.map((review) => review.guestId).filter((id): id is string => Boolean(id)) } }, select: { id: true, fullName: true } });
    const names = new Map(guests.map((guest) => [guest.id, guest.fullName]));
    const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
    return {
      average: Number(average.toFixed(2)), count: reviews.length,
      distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: reviews.filter((review) => review.rating === rating).length })),
      items: reviews.map((review) => ({
        id: review.id, guestName: review.guestId ? names.get(review.guestId) ?? 'Khách' : 'Khách',
        rating: review.rating, title: review.title, comment: review.comment, response: review.response,
        status: review.status, reviewDate: review.reviewDate.toISOString().slice(0, 10),
      })),
    };
  }

  async reply(actor: AuthUser, id: string, body: string) {
    const review = await this.prisma.guestReview.findFirst({ where: { id, orgId: actor.orgId } });
    if (!review) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy đánh giá', 404);
    const updated = await this.prisma.guestReview.update({ where: { id }, data: { response: body, respondedById: actor.id, respondedAt: new Date(), status: 'RESPONDED' } });
    await this.audit.record({ orgId: actor.orgId, propertyId: review.propertyId, actorId: actor.id, actorName: actor.fullName, action: 'crm.review_responded', entityType: 'GuestReview', entityId: id, after: { rating: review.rating } });
    return { id: updated.id, status: updated.status, respondedAt: updated.respondedAt?.toISOString() };
  }

  async campaigns(actor: AuthUser) {
    return this.prisma.campaign.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  async createCampaign(actor: AuthUser, input: { name: string; channel: string; segment: string; subject: string; body: string; scheduledAt?: string }) {
    return this.prisma.campaign.create({ data: { orgId: actor.orgId, name: input.name, channel: input.channel, segment: input.segment, subject: input.subject, body: input.body, scheduledAt: input.scheduledAt ? parseIsoDate(input.scheduledAt) : null, createdById: actor.id } });
  }

  async sendCampaign(actor: AuthUser, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, orgId: actor.orgId } });
    if (!campaign) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy chiến dịch', 404);
    const segments = await this.segments(actor);
    const recipients = segments.segments.find((segment) => segment.key === campaign.segment)?.count ?? 0;
    const updated = await this.prisma.campaign.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), recipientsCount: recipients } });
    await this.audit.record({ orgId: actor.orgId, actorId: actor.id, actorName: actor.fullName, action: 'crm.campaign_sent', entityType: 'Campaign', entityId: id, after: { recipients } });
    return { id: updated.id, status: updated.status, recipients };
  }
}
