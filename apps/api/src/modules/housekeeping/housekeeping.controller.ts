import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  createHousekeepingTaskSchema,
  housekeepingUpdateSchema,
  maintenanceTicketSchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { HousekeepingService } from './housekeeping.service';

@ApiTags('housekeeping')
@Controller('housekeeping')
export class HousekeepingController {
  constructor(private readonly housekeeping: HousekeepingService) {}

  @Get('tasks')
  @Permissions(PERMISSIONS.HOUSEKEEPING_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query('propertyId') propertyId: string,
    @Query('status') status?: string,
  ) {
    return this.housekeeping.list(actor, propertyId, status);
  }

  @Post('tasks')
  @Permissions(PERMISSIONS.HOUSEKEEPING_ASSIGN)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createHousekeepingTaskSchema)) body: z.infer<typeof createHousekeepingTaskSchema>,
  ) {
    return this.housekeeping.create(actor, body);
  }

  @Patch('tasks/:id')
  @Permissions(PERMISSIONS.HOUSEKEEPING_UPDATE)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(housekeepingUpdateSchema)) body: z.infer<typeof housekeepingUpdateSchema>,
  ) {
    return this.housekeeping.update(actor, id, body);
  }

  @Get('maintenance')
  @Permissions(PERMISSIONS.MAINTENANCE_VIEW)
  maintenance(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) {
    return this.housekeeping.maintenanceList(actor, propertyId);
  }

  @Post('maintenance')
  @Permissions(PERMISSIONS.MAINTENANCE_MANAGE)
  createMaintenance(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(maintenanceTicketSchema)) body: z.infer<typeof maintenanceTicketSchema>,
  ) {
    return this.housekeeping.createMaintenance(actor, body);
  }
}
