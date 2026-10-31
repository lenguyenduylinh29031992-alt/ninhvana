import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { IamModule } from '../iam/iam.module';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { GoogleSheetSyncService } from './google-sheet-sync.service';

@Module({ imports: [AccountingModule, IamModule], controllers: [HrController], providers: [HrService, GoogleSheetSyncService], exports: [HrService] })
export class HrModule {}
