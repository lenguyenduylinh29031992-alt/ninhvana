import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import type { z } from 'zod';
import type { inboxQuerySchema, inboxReplySchema, inboxUpdateSchema } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';
import { ChannelAdapterRegistry } from '../channels/adapters/registry';

type InboxQuery = z.infer<typeof inboxQuerySchema>;
type ReplyInput = z.infer<typeof inboxReplySchema>;
type UpdateInput = z.infer<typeof inboxUpdateSchema>;

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: ChannelAdapterRegistry,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser, query: InboxQuery) {
    const where: Prisma.ConversationWhereInput = {
      orgId: actor.orgId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channelCode ? { channel: { code: query.channelCode } } : {}),
      ...(query.q
        ? {
            OR: [
              { guestName: { contains: query.q, mode: 'insensitive' } },
              { guestHandle: { contains: query.q, mode: 'insensitive' } },
              { subject: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: {
          channel: { select: { code: true, name: true, type: true } },
          messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        },
        orderBy: [{ lastMessageAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return {
      counts: {
        open: await this.prisma.conversation.count({ where: { orgId: actor.orgId, status: 'OPEN' } }),
        pending: await this.prisma.conversation.count({ where: { orgId: actor.orgId, status: 'PENDING' } }),
        unread: await this.prisma.conversation.aggregate({ where: { orgId: actor.orgId }, _sum: { unreadCount: true } }),
      },
      items: items.map((conversation) => ({
        id: conversation.id,
        guestName: conversation.guestName,
        guestHandle: conversation.guestHandle,
        channel: conversation.channel,
        status: conversation.status,
        priority: conversation.priority,
        subject: conversation.subject,
        unreadCount: conversation.unreadCount,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        lastMessage: conversation.messages[0]?.body ?? null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async detail(actor: AuthUser, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, orgId: actor.orgId },
      include: {
        channel: { select: { code: true, name: true, type: true } },
        messages: { orderBy: { sentAt: 'asc' } },
      },
    });
    if (!conversation) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hội thoại', 404);
    if (conversation.unreadCount > 0) {
      await this.prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    }
    return {
      id: conversation.id,
      guestName: conversation.guestName,
      guestHandle: conversation.guestHandle,
      channel: conversation.channel,
      status: conversation.status,
      subject: conversation.subject,
      assignedToId: conversation.assignedToId,
      reservationId: conversation.reservationId,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      messages: conversation.messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        senderName: message.senderName,
        body: message.body,
        status: message.status,
        sentAt: message.sentAt.toISOString(),
      })),
    };
  }

  async reply(actor: AuthUser, id: string, input: ReplyInput) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, orgId: actor.orgId },
      include: { channel: true },
    });
    if (!conversation) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hội thoại', 404);
    const adapter = this.adapters.get(conversation.channel.code);
    const sent = await adapter.sendMessage(conversation.externalThreadId, input.body);
    const message = await this.prisma.conversationMessage.create({
      data: {
        conversationId: id,
        direction: 'OUTBOUND',
        externalId: sent.externalId || null,
        senderName: actor.fullName,
        body: input.body,
        status: sent.ok ? 'SENT' : 'FAILED',
      },
    });
    await this.prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date(), status: conversation.status === 'CLOSED' ? 'OPEN' : conversation.status },
    });
    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'inbox.replied',
      entityType: 'Conversation',
      entityId: id,
      after: { channel: conversation.channel.code, messageId: message.id },
    });
    return { id: message.id, status: message.status, sentAt: message.sentAt.toISOString() };
  }

  async update(actor: AuthUser, id: string, input: UpdateInput) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, orgId: actor.orgId } });
    if (!conversation) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy hội thoại', 404);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: {
        status: input.status,
        assignedToId: input.assignedToId,
        unreadCount: input.markRead ? 0 : undefined,
      },
    });
    return { id: updated.id, status: updated.status, assignedToId: updated.assignedToId };
  }
}
