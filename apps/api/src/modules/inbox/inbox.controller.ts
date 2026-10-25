import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, inboxQuerySchema, inboxReplySchema, inboxUpdateSchema } from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { InboxService } from './inbox.service';

@ApiTags('inbox')
@Controller('inbox/conversations')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @Permissions(PERMISSIONS.INBOX_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(inboxQuerySchema)) query: z.infer<typeof inboxQuerySchema>,
  ) {
    return this.inbox.list(actor, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.INBOX_VIEW)
  detail(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.inbox.detail(actor, id);
  }

  @Post(':id/reply')
  @Permissions(PERMISSIONS.INBOX_MANAGE)
  reply(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inboxReplySchema)) body: z.infer<typeof inboxReplySchema>,
  ) {
    return this.inbox.reply(actor, id, body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.INBOX_MANAGE)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(inboxUpdateSchema)) body: z.infer<typeof inboxUpdateSchema>,
  ) {
    return this.inbox.update(actor, id, body);
  }
}
