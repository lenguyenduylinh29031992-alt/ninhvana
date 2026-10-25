import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

@Module({ controllers: [MarketingController, AreasController], providers: [MarketingService, AreasService] })
export class MarketingModule {}
