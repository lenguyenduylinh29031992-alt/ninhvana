import { Module } from '@nestjs/common';
import { ChannelAdapterRegistry } from '../channels/adapters/registry';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  controllers: [InboxController],
  providers: [InboxService, ChannelAdapterRegistry],
})
export class InboxModule {}
