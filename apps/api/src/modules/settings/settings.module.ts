import { Module } from '@nestjs/common';
import {
  CurrenciesController,
  DocumentTemplatesController,
  ExchangeRatesController,
  IntegrationsController,
  SettingsController,
  TaxRatesController,
} from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [
    SettingsController,
    TaxRatesController,
    ExchangeRatesController,
    CurrenciesController,
    DocumentTemplatesController,
    IntegrationsController,
  ],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
