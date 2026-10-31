import { Module } from '@nestjs/common';
import { OperationsService } from './operations.service';
import { AssistantController, BanquetController, BudgetsController, RosterController } from './operations.controller';

@Module({
  controllers: [BudgetsController, RosterController, BanquetController, AssistantController],
  providers: [OperationsService],
})
export class OperationsModule {}
