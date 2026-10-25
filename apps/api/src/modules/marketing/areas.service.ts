import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.module';

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthUser) {
    const properties = await this.prisma.property.findMany({ where: { orgId: actor.orgId }, select: { id: true, code: true, name: true } });
    const areas = await this.prisma.propertyArea.findMany({ where: { orgId: actor.orgId }, orderBy: [{ sortOrder: 'asc' }] });
    return {
      properties,
      items: areas.map((area) => ({
        id: area.id, propertyId: area.propertyId, code: area.code, parentCode: area.parentCode,
        name: area.name, kind: area.kind, floorLabel: area.floorLabel, description: area.description,
        roomCount: area.roomCount, features: area.features, sortOrder: area.sortOrder,
      })),
    };
  }
}
