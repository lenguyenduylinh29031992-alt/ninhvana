import { Injectable } from '@nestjs/common';
import { HousekeepingStatus, HousekeepingType, Prisma } from '@prisma/client';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import type { z } from 'zod';
import type { createHousekeepingTaskSchema, housekeepingUpdateSchema, maintenanceTicketSchema } from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { RealtimeService } from '../realtime/realtime.service';

type CreateTaskInput = z.infer<typeof createHousekeepingTaskSchema>;
type UpdateTaskInput = z.infer<typeof housekeepingUpdateSchema>;
type MaintenanceInput = z.infer<typeof maintenanceTicketSchema>;

@Injectable()
export class HousekeepingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(actor: AuthUser, propertyId: string, status?: string) {
    assertPropertyAccess(actor, propertyId);
    const tasks = await this.prisma.housekeepingTask.findMany({
      where: { propertyId, ...(status ? { status: status as HousekeepingStatus } : {}) },
      include: {
        room: { include: { roomType: true, floor: true } },
        assignedTo: { select: { id: true, fullName: true } },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return {
      propertyId,
      counts: {
        pending: tasks.filter((task) => task.status === 'PENDING').length,
        inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
        done: tasks.filter((task) => task.status === 'DONE').length,
        blocked: tasks.filter((task) => task.status === 'BLOCKED').length,
      },
      items: tasks.map((task) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        priority: task.priority,
        notes: task.notes,
        checklist: task.checklist,
        createdAt: task.createdAt.toISOString(),
        startedAt: task.startedAt?.toISOString() ?? null,
        completedAt: task.completedAt?.toISOString() ?? null,
        room: {
          id: task.room.id,
          number: task.room.number,
          status: task.room.status,
          floor: task.room.floor?.name ?? null,
          roomType: task.room.roomType.name,
        },
        assignedTo: task.assignedTo,
      })),
    };
  }

  async create(actor: AuthUser, input: CreateTaskInput) {
    assertPropertyAccess(actor, input.propertyId);
    const room = await this.prisma.room.findFirst({
      where: { id: input.roomId, propertyId: input.propertyId },
    });
    if (!room) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy phòng', 404);
    const task = await this.prisma.housekeepingTask.create({
      data: {
        propertyId: input.propertyId,
        roomId: input.roomId,
        type: input.type as HousekeepingType,
        priority: input.priority,
        notes: input.notes,
        checklist: [
          { item: 'Đổ rác & thay túi', done: false },
          { item: 'Thay ga trải giường', done: false },
          { item: 'Vệ sinh phòng tắm', done: false },
          { item: 'Bổ sung minibar', done: false },
          { item: 'Hút bụi & lau sàn', done: false },
        ],
      },
    });
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: input.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'housekeeping.task_created',
      entityType: 'HousekeepingTask',
      entityId: task.id,
      after: { room: room.number, type: input.type },
    });
    this.realtime.emitToProperty(input.propertyId, 'housekeeping.updated', { taskId: task.id });
    return { id: task.id };
  }

  async update(actor: AuthUser, id: string, input: UpdateTaskInput) {
    const task = await this.prisma.housekeepingTask.findUnique({ where: { id }, include: { room: true } });
    if (!task) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy công việc', 404);
    assertPropertyAccess(actor, task.propertyId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.housekeepingTask.update({
        where: { id },
        data: {
          status: input.status ? (input.status as HousekeepingStatus) : undefined,
          checklist: input.checklist ? (input.checklist as unknown as Prisma.InputJsonValue) : undefined,
          notes: input.notes,
          assignedToId: input.assignedToId,
          startedAt: input.status === 'IN_PROGRESS' ? new Date() : undefined,
          completedAt: input.status === 'DONE' || input.status === 'VERIFIED' ? new Date() : undefined,
        },
      });
      if (input.status === 'DONE' && task.room.status === 'DIRTY') {
        await tx.room.update({ where: { id: task.roomId }, data: { status: 'CLEAN' } });
      }
      if (input.status === 'VERIFIED') {
        await tx.room.update({ where: { id: task.roomId }, data: { status: 'INSPECTED' } });
      }
      if (input.status === 'BLOCKED') {
        await tx.room.update({ where: { id: task.roomId }, data: { status: 'OUT_OF_ORDER' } });
      }
      return result;
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: task.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'housekeeping.task_updated',
      entityType: 'HousekeepingTask',
      entityId: id,
      before: { status: task.status },
      after: { status: updated.status, room: task.room.number },
    });
    this.realtime.emitToProperty(task.propertyId, 'housekeeping.updated', { taskId: id });
    return { id, status: updated.status };
  }

  async maintenanceList(actor: AuthUser, propertyId: string) {
    assertPropertyAccess(actor, propertyId);
    const tickets = await this.prisma.maintenanceTicket.findMany({
      where: { propertyId },
      include: { room: { select: { number: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return tickets.map((ticket) => ({
      id: ticket.id,
      category: ticket.category,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      room: ticket.room?.number ?? null,
      location: ticket.location,
      createdAt: ticket.createdAt.toISOString(),
    }));
  }

  async createMaintenance(actor: AuthUser, input: MaintenanceInput) {
    assertPropertyAccess(actor, input.propertyId);
    const ticket = await this.prisma.maintenanceTicket.create({
      data: {
        propertyId: input.propertyId,
        roomId: input.roomId,
        location: input.location,
        category: input.category,
        description: input.description,
        priority: input.priority,
        reportedById: actor.id,
      },
    });
    await this.audit.record({
      orgId: actor.orgId,
      propertyId: input.propertyId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'maintenance.ticket_created',
      entityType: 'MaintenanceTicket',
      entityId: ticket.id,
      after: { category: input.category },
    });
    return { id: ticket.id };
  }
}
