import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { FoliosModule } from '../folios/folios.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [AccountingModule, FoliosModule, RealtimeModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
