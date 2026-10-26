import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

const readSchema = z.object({ section: z.string().min(1).max(120).startsWith('/') });

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('badges')
  badges(@CurrentUser() actor: AuthUser, @Query('propertyId') propertyId?: string) {
    return this.notifications.badges(actor, propertyId);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.list(user.id, unreadOnly === 'true');
  }

  @Post('read')
  markSectionRead(@CurrentUser() actor: AuthUser, @Body(new ZodValidationPipe(readSchema)) body: z.infer<typeof readSchema>) {
    return this.notifications.markSectionRead(actor, body.section);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post('read-all-sections')
  markAllSectionsRead(@CurrentUser() actor: AuthUser) {
    return this.notifications.markAllSectionsRead(actor);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
