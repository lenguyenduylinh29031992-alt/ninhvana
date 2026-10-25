import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { businessDateOf } from '@grand-suite/shared';
import { Public } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.module';

/**
 * Public (unauthenticated) marketing figures for the sign-in screen.
 * Contains aggregate counts only — no names, guests or financial detail.
 */
@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('summary')
  async summary() {
    const [properties, rooms, channels, currencies] = await Promise.all([
      this.prisma.property.count({ where: { isActive: true } }),
      this.prisma.room.count({ where: { isActive: true } }),
      this.prisma.integrationConfig.count({ where: { status: { not: 'DISABLED' } } }),
      this.prisma.currency.count({ where: { isActive: true } }),
    ]);
    const hotel = await this.prisma.property.findFirst({
      where: { isActive: true, type: 'HOTEL' },
      select: { timezone: true, businessDayCutoff: true },
    });
    return {
      properties,
      rooms,
      channels,
      currencies,
      businessDate: businessDateOf(new Date(), {
        timeZone: hotel?.timezone ?? 'Asia/Ho_Chi_Minh',
        cutoffHour: hotel?.businessDayCutoff ?? 6,
      }),
    };
  }
}
