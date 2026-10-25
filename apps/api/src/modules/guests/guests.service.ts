import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, AppError, moneyToJson } from '@grand-suite/shared';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { PrismaService } from '../../common/prisma/prisma.module';
import { SequenceService } from '../../common/sequence/sequence.module';

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
  ) {}

  async list(actor: AuthUser, query: { q?: string; page: number; pageSize: number }) {
    const where: Prisma.GuestWhereInput = {
      orgId: actor.orgId,
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
              { code: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.guest.findMany({
        where,
        include: { _count: { select: { reservations: true, folios: true } } },
        orderBy: [{ lastStayAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.guest.count({ where }),
    ]);
    return {
      items: items.map((guest) => ({
        id: guest.id,
        code: guest.code,
        fullName: guest.fullName,
        email: guest.email,
        phone: guest.phone,
        nationality: guest.nationality,
        vipLevel: guest.vipLevel,
        totalStays: guest.totalStays,
        totalNights: guest.totalNights,
        lifetimeValue: moneyToJson(guest.lifetimeValue),
        lastStayAt: guest.lastStayAt?.toISOString() ?? null,
        reservations: guest._count.reservations,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async detail(actor: AuthUser, id: string) {
    const guest = await this.prisma.guest.findFirst({
      where: { id, orgId: actor.orgId },
      include: {
        documents: true,
        preferences: true,
        reservations: {
          include: { property: { select: { name: true } }, rooms: { include: { roomType: true } } },
          orderBy: { checkIn: 'desc' },
          take: 20,
        },
        folios: {
          include: { property: { select: { name: true } } },
          orderBy: { openedAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!guest) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy khách hàng', 404);
    if (!actor.orgWide) {
      const allowed = new Set(
        actor.roles.map((role) => role.propertyId).filter((propertyId): propertyId is string => Boolean(propertyId)),
      );
      if (!guest.reservations.some((reservation) => reservation.propertyId && allowed.has(reservation.propertyId))) {
        assertPropertyAccess(actor, '');
      }
    }
    return {
      id: guest.id,
      code: guest.code,
      fullName: guest.fullName,
      firstName: guest.firstName,
      lastName: guest.lastName,
      email: guest.email,
      phone: guest.phone,
      nationality: guest.nationality,
      dob: guest.dob?.toISOString().slice(0, 10) ?? null,
      gender: guest.gender,
      address: guest.address,
      city: guest.city,
      vipLevel: guest.vipLevel,
      isBlacklisted: guest.isBlacklisted,
      notes: guest.notes,
      totalStays: guest.totalStays,
      totalNights: guest.totalNights,
      lifetimeValue: moneyToJson(guest.lifetimeValue),
      documents: guest.documents.map((document) => ({
        id: document.id,
        type: document.type,
        maskedNumber: `•••• ${document.numberLast4}`,
        verifiedAt: document.verifiedAt?.toISOString() ?? null,
      })),
      preferences: guest.preferences,
      reservations: guest.reservations.map((reservation) => ({
        id: reservation.id,
        code: reservation.code,
        status: reservation.status,
        checkIn: reservation.checkIn.toISOString().slice(0, 10),
        checkOut: reservation.checkOut.toISOString().slice(0, 10),
        property: reservation.property.name,
        roomType: reservation.rooms[0]?.roomType.name ?? null,
      })),
      folios: guest.folios.map((folio) => ({
        id: folio.id,
        number: folio.number,
        status: folio.status,
        balance: moneyToJson(folio.balance),
        property: folio.property.name,
      })),
    };
  }

  async create(
    actor: AuthUser,
    input: {
      propertyId: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      nationality?: string;
      country?: string;
      notes?: string;
      vipLevel?: number;
    },
  ) {
    assertPropertyAccess(actor, input.propertyId);
    const code = await this.sequence.nextPublic(input.propertyId, 'GUEST');
    const guest = await this.prisma.guest.create({
      data: {
        orgId: actor.orgId,
        code,
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: `${input.lastName} ${input.firstName}`.trim(),
        email: input.email,
        phone: input.phone,
        nationality: input.nationality,
        country: input.country,
        notes: input.notes,
        vipLevel: input.vipLevel ?? 0,
      },
    });
    return { id: guest.id, code: guest.code, fullName: guest.fullName };
  }

  async update(
    actor: AuthUser,
    id: string,
    input: { email?: string; phone?: string; notes?: string; vipLevel?: number; isBlacklisted?: boolean },
  ) {
    const guest = await this.prisma.guest.findFirst({ where: { id, orgId: actor.orgId } });
    if (!guest) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy khách hàng', 404);
    const updated = await this.prisma.guest.update({
      where: { id },
      data: {
        email: input.email,
        phone: input.phone,
        notes: input.notes,
        vipLevel: input.vipLevel,
        isBlacklisted: input.isBlacklisted,
      },
    });
    return { id: updated.id, vipLevel: updated.vipLevel };
  }
}
