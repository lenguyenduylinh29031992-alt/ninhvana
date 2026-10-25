import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, nightAuditSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { NightAuditService } from './night-audit.service';

@ApiTags('night-audit')
@Controller('night-audit')
export class NightAuditController {
  constructor(private readonly nightAudit: NightAuditService) {}

  @Get('report')
  @Permissions(PERMISSIONS.NIGHT_AUDIT_VIEW)
  report(
    @CurrentUser() actor: AuthUser,
    @Query('propertyId') propertyId: string,
    @Query('businessDate') businessDate: string,
  ) {
    return this.nightAudit.report(actor, propertyId, businessDate);
  }

  @Get('latest')
  @Permissions(PERMISSIONS.NIGHT_AUDIT_VIEW)
  latest(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId: string) {
    return this.nightAudit.latest(actor, propertyId);
  }

  @Post('run')
  @Permissions(PERMISSIONS.NIGHT_AUDIT_RUN)
  run(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(nightAuditSchema)) body: z.infer<typeof nightAuditSchema>,
  ) {
    return this.nightAudit.run(actor, body);
  }

  @Post(':id/reopen')
  @Permissions(PERMISSIONS.NIGHT_AUDIT_REOPEN)
  reopen(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.nightAudit.reopen(actor, id, body.reason ?? 'Mở lại theo yêu cầu');
  }
}
