import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { RoomsService } from './rooms.service';

const statusSchema = z.object({
  status: z.enum(['CLEAN', 'DIRTY', 'INSPECTED', 'OUT_OF_ORDER', 'OUT_OF_SERVICE']),
  reason: z.string().max(300).optional(),
});

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('types')
  @Permissions(PERMISSIONS.ROOM_VIEW)
  types(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) {
    return this.rooms.roomTypes(actor, propertyId);
  }

  @Get('tape-chart')
  @Permissions(PERMISSIONS.ROOM_VIEW)
  tapeChart(
    @CurrentUser() actor: AuthUser,
    @Query('propertyId') propertyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.rooms.tapeChart(actor, propertyId, from, to);
  }

  @Patch(':id/status')
  @Permissions(PERMISSIONS.ROOM_STATUS)
  updateStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: z.infer<typeof statusSchema>,
  ) {
    return this.rooms.updateStatus(actor, id, body.status as never, body.reason);
  }
}
