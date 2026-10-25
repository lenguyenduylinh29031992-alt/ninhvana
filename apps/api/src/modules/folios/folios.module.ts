import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FoliosController } from './folios.controller';
import { FoliosService } from './folios.service';

@Module({
  imports: [AccountingModule, RealtimeModule],
  controllers: [FoliosController],
  providers: [FoliosService],
  exports: [FoliosService],
})
export class FoliosModule {}
