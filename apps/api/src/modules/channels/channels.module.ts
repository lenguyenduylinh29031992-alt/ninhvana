import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ChannelAdapterRegistry } from './adapters/registry';
import { ChannelWebhookController, ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [ReservationsModule, RealtimeModule],
  controllers: [ChannelsController, ChannelWebhookController],
  providers: [ChannelsService, ChannelAdapterRegistry],
  exports: [ChannelsService, ChannelAdapterRegistry],
})
export class ChannelsModule {}
