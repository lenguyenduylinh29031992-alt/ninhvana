import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  AppError,
  type ExchangeRateRecord,
  type SettingRecord,
  type TaxRateRecord,
} from '@grand-suite/shared';
import type { z } from 'zod';
import {
  exchangeRateQuerySchema,
  exchangeRateSchema,
  settingsQuerySchema,
  taxRateSchema,
  upsertSettingSchema,
} from '@grand-suite/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertPropertyAccess } from '../../common/auth/property-access';
import { CryptoService } from '../../common/crypto/crypto.module';
import { PrismaService } from '../../common/prisma/prisma.module';

type SettingQuery = z.infer<typeof settingsQuerySchema>;
type SettingInput = z.infer<typeof upsertSettingSchema>;
type TaxRateInput = z.infer<typeof taxRateSchema>;
type ExchangeInput = z.infer<typeof exchangeRateSchema>;
type ExchangeQuery = z.infer<typeof exchangeRateQuerySchema>;

export interface IntegrationPatch {
  displayName?: string;
  status?: 'DISABLED' | 'SANDBOX' | 'ACTIVE' | 'ERROR';
  credentials?: Record<string, string>;
  settings?: Record<string, unknown>;
}

const SENSITIVE_PREFIXES = ['approval.', 'security.', 'finance.'];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  async listSettings(actor: AuthUser, query: SettingQuery): Promise<SettingRecord[]> {
    const scopes = ['ORG', ...actor.roles.map((role) => role.propertyId).filter(Boolean)];
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        orgId: actor.orgId,
        isSecret: false,
        ...(query.scope
          ? { scope: query.scope }
          : actor.orgWide
            ? {}
            : { scope: { in: scopes as string[] } }),
        ...(query.category ? { category: query.category } : {}),
      },
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      key: row.key,
      value: row.value,
      category: row.category,
      description: row.description,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async upsertSetting(
    actor: AuthUser,
    scope: string,
    key: string,
    input: SettingInput & { reason?: string },
  ): Promise<SettingRecord> {
    if (scope === 'ORG') {
      if (!actor.orgWide) {
        throw new AppError(ERROR_CODES.FORBIDDEN, 'Chỉ quản trị cấp tập đoàn được sửa cấu hình chung', 403);
      }
    } else {
      assertPropertyAccess(actor, scope);
    }

    const isSuperAdmin = actor.roles.some((assignment) => assignment.roleCode === 'SUPER_ADMIN');
    if ((key.startsWith('branding.') || key.endsWith('.name')) && !isSuperAdmin) {
      throw new AppError(ERROR_CODES.FORBIDDEN, 'Chỉ tài khoản Admin được phép đổi tên thương hiệu.', 403);
    }

    const sensitive = SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix));
    if (sensitive && (!input.reason || input.reason.trim().length < 5)) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Cấu hình tài chính/bảo mật yêu cầu nhập lý do thay đổi',
        422,
      );
    }

    const previous = await this.prisma.systemSetting.findUnique({
      where: { orgId_scope_key: { orgId: actor.orgId, scope, key } },
    });

    const record = await this.prisma.systemSetting.upsert({
      where: { orgId_scope_key: { orgId: actor.orgId, scope, key } },
      update: {
        value: input.value as never,
        category: input.category ?? previous?.category ?? 'general',
        description: input.description ?? previous?.description,
        updatedById: actor.id,
      },
      create: {
        orgId: actor.orgId,
        scope,
        key,
        value: input.value as never,
        category: input.category ?? 'general',
        description: input.description,
        updatedById: actor.id,
      },
    });

    await this.audit.record({
      orgId: actor.orgId,
      propertyId: scope === 'ORG' ? null : scope,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'settings.updated',
      entityType: 'SystemSetting',
      entityId: record.id,
      reason: input.reason ?? null,
      before: previous ? { value: previous.value } : null,
      after: { value: record.value },
      metadata: { key, scope },
    });

    return {
      id: record.id,
      scope: record.scope,
      key: record.key,
      value: record.value,
      category: record.category,
      description: record.description,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async listTaxRates(actor: AuthUser): Promise<TaxRateRecord[]> {
    const rows = await this.prisma.taxRate.findMany({
      where: { orgId: actor.orgId },
      orderBy: [{ type: 'asc' }, { rate: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      rate: row.rate.toString(),
      type: row.type,
      isIncluded: row.isIncluded,
      glAccountCode: row.glAccountCode,
      isActive: row.isActive,
    }));
  }

  async createTaxRate(actor: AuthUser, input: TaxRateInput): Promise<TaxRateRecord> {
    const existing = await this.prisma.taxRate.findUnique({
      where: { orgId_code: { orgId: actor.orgId, code: input.code } },
    });
    if (existing) throw new AppError(ERROR_CODES.CONFLICT, 'Mã thuế đã tồn tại', 409);

    const created = await this.prisma.taxRate.create({
      data: {
        orgId: actor.orgId,
        code: input.code,
        name: input.name,
        rate: input.rate,
        type: input.type,
        isIncluded: input.isIncluded,
        glAccountCode: input.glAccountCode,
        isActive: input.isActive,
      },
    });
    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'settings.tax_rate_created',
      entityType: 'TaxRate',
      entityId: created.id,
      after: { code: created.code, rate: created.rate.toString(), type: created.type },
    });
    return {
      id: created.id,
      code: created.code,
      name: created.name,
      rate: created.rate.toString(),
      type: created.type,
      isIncluded: created.isIncluded,
      glAccountCode: created.glAccountCode,
      isActive: created.isActive,
    };
  }

  async updateTaxRate(
    actor: AuthUser,
    id: string,
    input: Partial<TaxRateInput> & { reason?: string },
  ): Promise<TaxRateRecord> {
    const existing = await this.prisma.taxRate.findFirst({ where: { id, orgId: actor.orgId } });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Không tìm thấy thuế', 404);
    if (input.rate !== undefined && input.rate !== Number(existing.rate) && !input.reason) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Thay đổi thuế suất yêu cầu nhập lý do', 422);
    }

    const updated = await this.prisma.taxRate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.rate !== undefined ? { rate: input.rate } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.isIncluded !== undefined ? { isIncluded: input.isIncluded } : {}),
        ...(input.glAccountCode !== undefined ? { glAccountCode: input.glAccountCode } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'settings.tax_rate_updated',
      entityType: 'TaxRate',
      entityId: id,
      reason: input.reason ?? null,
      before: { rate: existing.rate.toString(), isActive: existing.isActive },
      after: { rate: updated.rate.toString(), isActive: updated.isActive },
    });

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      rate: updated.rate.toString(),
      type: updated.type,
      isIncluded: updated.isIncluded,
      glAccountCode: updated.glAccountCode,
      isActive: updated.isActive,
    };
  }

  async listExchangeRates(actor: AuthUser, query: ExchangeQuery): Promise<ExchangeRateRecord[]> {
    const rows = await this.prisma.exchangeRate.findMany({
      where: {
        orgId: actor.orgId,
        ...(query.base ? { base: query.base } : {}),
        ...(query.quote ? { quote: query.quote } : {}),
        ...(query.from || query.to
          ? {
              effectiveDate: {
                ...(query.from ? { gte: new Date(`${query.from}T00:00:00Z`) } : {}),
                ...(query.to ? { lte: new Date(`${query.to}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ effectiveDate: 'desc' }, { base: 'asc' }],
      take: 500,
    });
    return rows.map((row) => ({
      id: row.id,
      base: row.base,
      quote: row.quote,
      rate: row.rate.toString(),
      effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      source: row.source,
    }));
  }

  async upsertExchangeRate(actor: AuthUser, input: ExchangeInput): Promise<ExchangeRateRecord> {
    const effectiveDate = new Date(`${input.effectiveDate}T00:00:00Z`);
    const record = await this.prisma.exchangeRate.upsert({
      where: {
        orgId_base_quote_effectiveDate: {
          orgId: actor.orgId,
          base: input.base,
          quote: input.quote,
          effectiveDate,
        },
      },
      update: { rate: input.rate, source: input.source ?? 'manual' },
      create: {
        orgId: actor.orgId,
        base: input.base,
        quote: input.quote,
        rate: input.rate,
        effectiveDate,
        source: input.source ?? 'manual',
      },
    });
    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'settings.exchange_rate_upserted',
      entityType: 'ExchangeRate',
      entityId: record.id,
      after: { base: input.base, quote: input.quote, rate: input.rate, effectiveDate: input.effectiveDate },
    });
    return {
      id: record.id,
      base: record.base,
      quote: record.quote,
      rate: record.rate.toString(),
      effectiveDate: record.effectiveDate.toISOString().slice(0, 10),
      source: record.source,
    };
  }

  async listCurrencies() {
    const rows = await this.prisma.currency.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      nameEn: row.nameEn,
      symbol: row.symbol,
      decimals: row.decimals,
      isActive: row.isActive,
    }));
  }

  async listTemplates(actor: AuthUser) {
    const rows = await this.prisma.documentTemplate.findMany({
      where: { orgId: actor.orgId },
      orderBy: [{ type: 'asc' }, { locale: 'asc' }],
      select: { id: true, type: true, name: true, locale: true, isDefault: true, updatedAt: true },
    });
    return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  }

  async listIntegrations(actor: AuthUser) {
    const rows = await this.prisma.integrationConfig.findMany({
      where: { orgId: actor.orgId },
      orderBy: [{ category: 'asc' }, { provider: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      category: row.category,
      displayName: row.displayName,
      status: row.status,
      hasCredentials: Boolean(row.credentialsEnc),
      settings: row.settings,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      lastError: row.lastError,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async updateIntegration(actor: AuthUser, provider: string, input: IntegrationPatch) {
    const existing = await this.prisma.integrationConfig.findUnique({
      where: { orgId_provider: { orgId: actor.orgId, provider } },
    });
    if (!existing) throw new AppError(ERROR_CODES.NOT_FOUND, 'Chưa có cấu hình tích hợp này', 404);

    const credentialsEnc = input.credentials
      ? this.crypto.encrypt(JSON.stringify(input.credentials))
      : undefined;

    const updated = await this.prisma.integrationConfig.update({
      where: { id: existing.id },
      data: {
        displayName: input.displayName ?? existing.displayName,
        status: input.status ?? existing.status,
        ...(credentialsEnc ? { credentialsEnc } : {}),
        ...(input.settings ? { settings: input.settings as never } : {}),
      },
    });

    await this.audit.record({
      orgId: actor.orgId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.roles[0]?.roleCode,
      action: 'settings.integration_updated',
      entityType: 'IntegrationConfig',
      entityId: updated.id,
      reason: `Cập nhật kết nối ${provider}`,
      before: { status: existing.status, hasCredentials: Boolean(existing.credentialsEnc) },
      after: {
        status: updated.status,
        hasCredentials: Boolean(updated.credentialsEnc),
        credentialKeys: input.credentials ? Object.keys(input.credentials) : [],
      },
    });

    return {
      id: updated.id,
      provider: updated.provider,
      category: updated.category,
      displayName: updated.displayName,
      status: updated.status,
      hasCredentials: Boolean(updated.credentialsEnc),
      settings: updated.settings,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
