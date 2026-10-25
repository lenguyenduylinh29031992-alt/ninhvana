import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  overview(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) {
    return this.dashboard.overview(actor, propertyId && propertyId !== 'ALL' ? propertyId : null);
  }

  @Get('stats')
  @Permissions(PERMISSIONS.DASHBOARD_VIEW)
  stats(@CurrentUser() actor: AuthUser) {
    return this.dashboard.stats(actor);
  }
}
