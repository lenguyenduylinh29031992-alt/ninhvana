import { Body, Controller, Get, Param, Patch, Post, Query, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  exchangeRateQuerySchema,
  exchangeRateSchema,
  settingKeySchema,
  settingsQuerySchema,
  taxRateSchema,
  upsertSettingSchema,
} from '@grand-suite/shared';
import { z } from 'zod';
import { CurrentUser, Permissions } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';
import { ZodValidationPipe } from '../../common/http/zod-validation.pipe';
import { SettingsService, type IntegrationPatch } from './settings.service';

const putSettingSchema = upsertSettingSchema.extend({
  scope: z.string().trim().min(1).max(64),
  reason: z.string().trim().max(300).optional(),
});

const taxRateUpdateSchema = taxRateSchema
  .partial()
  .omit({ code: true })
  .extend({ reason: z.string().trim().max(300).optional() });

const integrationPatchSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  status: z.enum(['DISABLED', 'SANDBOX', 'ACTIVE', 'ERROR']).optional(),
  credentials: z.record(z.string().max(2000)).optional(),
  settings: z.record(z.unknown()).optional(),
});

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(settingsQuerySchema)) query: z.infer<typeof settingsQuerySchema>,
  ) {
    return this.settings.listSettings(actor, query);
  }

  @Put()
  @Permissions(PERMISSIONS.SETTINGS_UPDATE)
  put(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(putSettingSchema))
    body: z.infer<typeof putSettingSchema>,
  ) {
    return this.settings.upsertSetting(actor, body.scope, body.key, body);
  }
}

@ApiTags('settings')
@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_VIEW)
  list(@CurrentUser() actor: AuthUser) {
    return this.settings.listTaxRates(actor);
  }

  @Post()
  @Permissions(PERMISSIONS.SETTINGS_UPDATE)
  create(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(taxRateSchema)) body: z.infer<typeof taxRateSchema>,
  ) {
    return this.settings.createTaxRate(actor, body);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.SETTINGS_UPDATE)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(taxRateUpdateSchema)) body: z.infer<typeof taxRateUpdateSchema>,
  ) {
    return this.settings.updateTaxRate(actor, id, body);
  }
}

@ApiTags('settings')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_VIEW)
  list(
    @CurrentUser() actor: AuthUser,
    @Query(new ZodValidationPipe(exchangeRateQuerySchema))
    query: z.infer<typeof exchangeRateQuerySchema>,
  ) {
    return this.settings.listExchangeRates(actor, query);
  }

  @Post()
  @Permissions(PERMISSIONS.SETTINGS_UPDATE)
  upsert(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(exchangeRateSchema)) body: z.infer<typeof exchangeRateSchema>,
  ) {
    return this.settings.upsertExchangeRate(actor, body);
  }
}

@ApiTags('settings')
@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_VIEW)
  list() {
    return this.settings.listCurrencies();
  }
}

@ApiTags('settings')
@Controller('document-templates')
export class DocumentTemplatesController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.SETTINGS_VIEW)
  list(@CurrentUser() actor: AuthUser) {
    return this.settings.listTemplates(actor);
  }
}

@ApiTags('settings')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.INTEGRATION_VIEW)
  list(@CurrentUser() actor: AuthUser) {
    return this.settings.listIntegrations(actor);
  }

  @Patch(':provider')
  @Permissions(PERMISSIONS.INTEGRATION_MANAGE)
  update(
    @CurrentUser() actor: AuthUser,
    @Param('provider') provider: string,
    @Body(new ZodValidationPipe(integrationPatchSchema)) body: IntegrationPatch,
  ) {
    return this.settings.updateIntegration(actor, provider, body);
  }
}

export { settingKeySchema };
