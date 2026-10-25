import { Injectable } from '@nestjs/common';
import { AppError, ERROR_CODES } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';

export interface MarketingInput {
  title: string;
  description?: string;
  status?: string;
  channel?: string;
  budget?: number;
  notes?: string;
  parentId?: string | null;
}

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async tree(actor: AuthUser) {
    const items = await this.prisma.marketingItem.findMany({ where: { orgId: actor.orgId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const nodes = items.map((item) => ({
      id: item.id, parentId: item.parentId, title: item.title, description: item.description,
      status: item.status, channel: item.channel, budget: item.budget ? Number(item.budget) : null,
      notes: item.notes, sortOrder: item.sortOrder, children: [] as unknown[],
    }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const roots: typeof nodes = [];
    for (const node of nodes) {
      if (node.parentId && byId.has(node.parentId)) (byId.get(node.parentId)!.children as typeof nodes).push(node);
      else roots.push(node);
    }
    return { items: nodes, roots, total: nodes.length };
  }

  async create(actor: AuthUser, input: MarketingInput) {
    if (input.parentId) {
      const parent = await this.prisma.marketingItem.findFirst({ where: { id: input.parentId, orgId: actor.orgId } });
      if (!parent) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy mục marketing cha', 404);
    }
    const siblings = await this.prisma.marketingItem.count({ where: { orgId: actor.orgId, parentId: input.parentId ?? null } });
    const item = await this.prisma.marketingItem.create({
      data: {
        orgId: actor.orgId,
        parentId: input.parentId ?? null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: input.status ?? 'PLANNED',
        channel: input.channel?.trim() || null,
        budget: input.budget == null ? null : input.budget,
        notes: input.notes?.trim() || null,
        sortOrder: siblings + 1,
        createdById: actor.id,
      },
    });
    await this.audit.record({ orgId: actor.orgId, actorId: actor.id, actorName: actor.fullName, action: 'marketing.item_created', entityType: 'MarketingItem', entityId: item.id, after: { title: item.title, parentId: item.parentId } });
    return item;
  }

  async update(actor: AuthUser, id: string, input: Partial<MarketingInput>) {
    const existing = await this.prisma.marketingItem.findFirst({ where: { id, orgId: actor.orgId } });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy mục marketing', 404);
    const item = await this.prisma.marketingItem.update({
      where: { id },
      data: {
        title: input.title?.trim() ?? undefined,
        description: input.description === undefined ? undefined : input.description.trim() || null,
        status: input.status ?? undefined,
        channel: input.channel === undefined ? undefined : input.channel.trim() || null,
        budget: input.budget === undefined ? undefined : input.budget,
        notes: input.notes === undefined ? undefined : input.notes.trim() || null,
      },
    });
    await this.audit.record({ orgId: actor.orgId, actorId: actor.id, actorName: actor.fullName, action: 'marketing.item_updated', entityType: 'MarketingItem', entityId: id, before: { title: existing.title }, after: { title: item.title } });
    return item;
  }

  async remove(actor: AuthUser, id: string) {
    const existing = await this.prisma.marketingItem.findFirst({ where: { id, orgId: actor.orgId } });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy mục marketing', 404);
    await this.prisma.marketingItem.delete({ where: { id } });
    await this.audit.record({ orgId: actor.orgId, actorId: actor.id, actorName: actor.fullName, action: 'marketing.item_deleted', entityType: 'MarketingItem', entityId: id, before: { title: existing.title } });
    return { ok: true };
  }
}
