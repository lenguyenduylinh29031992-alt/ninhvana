import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@grand-suite/shared';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { CrmService } from './crm.service';

@ApiTags('crm')
@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('segments') @Permissions(PERMISSIONS.CRM_VIEW)
  segments(@CurrentUser() actor: AuthUser) { return this.crm.segments(actor); }

  @Get('reviews') @Permissions(PERMISSIONS.CRM_VIEW)
  reviews(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) { return this.crm.reviews(actor, propertyId); }

  @Post('reviews/:id/reply') @Permissions(PERMISSIONS.CRM_MANAGE)
  reply(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: { response: string }) {
    if (!body?.response?.trim()) throw new Error('Nội dung phản hồi không được để trống');
    return this.crm.reply(actor, id, body.response.trim());
  }

  @Get('campaigns') @Permissions(PERMISSIONS.CRM_VIEW)
  campaigns(@CurrentUser() actor: AuthUser) { return this.crm.campaigns(actor); }

  @Post('campaigns') @Permissions(PERMISSIONS.CRM_MANAGE)
  create(@CurrentUser() actor: AuthUser, @Body() body: { name: string; channel: string; segment: string; subject: string; body: string; scheduledAt?: string }) {
    return this.crm.createCampaign(actor, body);
  }

  @Post('campaigns/:id/send') @Permissions(PERMISSIONS.CRM_MANAGE)
  send(@CurrentUser() actor: AuthUser, @Param('id') id: string) { return this.crm.sendCampaign(actor, id); }
}
