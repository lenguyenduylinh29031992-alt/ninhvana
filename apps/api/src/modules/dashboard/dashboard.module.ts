import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { PropertiesModule } from '../properties/properties.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PropertiesModule, HealthModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
