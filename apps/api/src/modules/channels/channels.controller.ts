import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  channelJobTestSchema,
  channelMappingSchema,
  channelPushSchema,
  channelWebhookSchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions, Public } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { ChannelsService } from './channels.service';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  @Permissions(PERMISSIONS.CHANNEL_VIEW)
  list(@CurrentUser() actor: AuthUser) {
    return this.channels.list(actor);
  }

  @Get('logs')
  @Permissions(PERMISSIONS.CHANNEL_VIEW)
  logs(@CurrentUser() actor: AuthUser) {
    return this.channels.list(actor).then((data) => data.logs);
  }

  @Get(':code/mappings')
  @Permissions(PERMISSIONS.CHANNEL_VIEW)
  mappings(@CurrentUser() actor: AuthUser, @Param('code') code: string) {
    return this.channels.mappings(actor, code);
  }

  @Put(':code/mappings')
  @Permissions(PERMISSIONS.CHANNEL_MANAGE)
  upsertMapping(
    @CurrentUser() actor: AuthUser,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(channelMappingSchema)) body: z.infer<typeof channelMappingSchema>,
  ) {
    return this.channels.upsertMapping(actor, code, body);
  }

  @Post(':code/push-ari')
  @Permissions(PERMISSIONS.CHANNEL_SYNC)
  push(
    @CurrentUser() actor: AuthUser,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(channelPushSchema)) body: z.infer<typeof channelPushSchema>,
  ) {
    return this.channels.pushAri(actor, code, body);
  }

  @Post(':code/pull')
  @Permissions(PERMISSIONS.CHANNEL_SYNC)
  pull(@CurrentUser() actor: AuthUser, @Param('code') code: string, @Query('count') count = '2') {
    return this.channels.pull(actor, code, Math.min(5, Math.max(1, Number(count) || 2)));
  }

  @Post(':code/process')
  @Permissions(PERMISSIONS.CHANNEL_SYNC)
  process(@CurrentUser() actor: AuthUser, @Param('code') code: string, @Query('force') force = 'false') {
    return this.channels.processJobs(actor, code, { force: force === 'true' });
  }

  @Post(':code/test-job')
  @Permissions(PERMISSIONS.CHANNEL_SYNC)
  testJob(
    @CurrentUser() actor: AuthUser,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(channelJobTestSchema)) body: z.infer<typeof channelJobTestSchema>,
  ) {
    return this.channels.enqueueTestJob(actor, code, body);
  }

  @Post('jobs/:id/retry')
  @Permissions(PERMISSIONS.CHANNEL_SYNC)
  retry(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.channels.retryJob(actor, id);
  }
}

@ApiTags('channel-webhooks')
@Public()
@Controller('channels/webhooks')
export class ChannelWebhookController {
  constructor(private readonly channels: ChannelsService) {}

  @Post(':provider')
  receive(
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(channelWebhookSchema)) body: z.infer<typeof channelWebhookSchema>,
    @Headers('x-channel-signature') signature?: string,
    @Headers('x-channel-timestamp') timestamp?: string,
  ) {
    return this.channels.webhook(provider, body, signature, timestamp);
  }
}
