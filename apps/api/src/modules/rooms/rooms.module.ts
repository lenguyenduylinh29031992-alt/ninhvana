import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({ imports: [RealtimeModule], controllers: [RoomsController], providers: [RoomsService] })
export class RoomsModule {}
