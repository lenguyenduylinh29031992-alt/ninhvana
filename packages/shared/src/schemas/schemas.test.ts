import { describe, expect, it } from 'vitest';
import { loginSchema, passwordSchema } from './auth';
import { createUserSchema } from './iam';
import { paginationSchema } from './common';
import { createPropertySchema } from './property';
import { taxRateSchema, exchangeRateSchema, upsertSettingSchema } from './settings';

describe('login schema', () => {
  it('normalises email casing and trims it', () => {
    const parsed = loginSchema.parse({ email: '  CEO@GrandSuite.VN ', password: 'x' });
    expect(parsed.email).toBe('ceo@grandsuite.vn');
    expect(parsed.rememberMe).toBe(false);
  });

  it('requires a 6-digit TOTP code when supplied', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x', totpCode: '12345' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x', totpCode: '123456' }).success).toBe(true);
  });
});

describe('password policy', () => {
  it('rejects short or weak passwords', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('allletters').success).toBe(false);
    expect(passwordSchema.safeParse('1234567890').success).toBe(false);
    expect(passwordSchema.safeParse('GrandSuite@2026').success).toBe(true);
  });
});

describe('user creation', () => {
  const base = {
    email: 'frontdesk@grandsuite.vn',
    fullName: 'Nguyễn Thị Lễ Tân',
    password: 'GrandSuite@2026',
    roles: [{ roleCode: 'FRONT_DESK', propertyId: 'prop-1' }],
  };

  it('accepts a property-scoped role', () => {
    expect(createUserSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a property-scoped role without a property', () => {
    const result = createUserSchema.safeParse({
      ...base,
      roles: [{ roleCode: 'FRONT_DESK', propertyId: null }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an org-wide role bound to a property', () => {
    const result = createUserSchema.safeParse({
      ...base,
      roles: [{ roleCode: 'CEO', propertyId: 'prop-1' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate role assignments', () => {
    const result = createUserSchema.safeParse({
      ...base,
      roles: [
        { roleCode: 'FRONT_DESK', propertyId: 'prop-1' },
        { roleCode: 'FRONT_DESK', propertyId: 'prop-1' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown roles', () => {
    const result = createUserSchema.safeParse({
      ...base,
      roles: [{ roleCode: 'WIZARD', propertyId: 'prop-1' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('pagination schema', () => {
  it('coerces query strings and applies defaults', () => {
    const parsed = paginationSchema.parse({ page: '2', pageSize: '50' });
    expect(parsed).toEqual({ page: 2, pageSize: 50, q: undefined, sort: undefined, order: 'desc' });
  });

  it('caps page size and rejects zero pages', () => {
    expect(paginationSchema.safeParse({ pageSize: '500' }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('property schema', () => {
  const property = {
    code: 'gsl-han',
    name: 'Grand Suite Hà Nội',
    type: 'HOTEL',
    address: '1 Đường Tràng Tiền',
    city: 'Hà Nội',
  };

  it('uppercases the code and fills defaults', () => {
    const parsed = createPropertySchema.parse(property);
    expect(parsed.code).toBe('GSL-HAN');
    expect(parsed.country).toBe('VN');
    expect(parsed.currency).toBe('VND');
    expect(parsed.businessDayCutoff).toBe(6);
    expect(parsed.checkInTime).toBe('14:00');
  });

  it('rejects malformed codes and times', () => {
    expect(createPropertySchema.safeParse({ ...property, code: 'A' }).success).toBe(false);
    expect(createPropertySchema.safeParse({ ...property, checkInTime: '25:00' }).success).toBe(false);
  });
});

describe('settings schemas', () => {
  it('validates tax rates between 0 and 100', () => {
    expect(
      taxRateSchema.safeParse({ code: 'vat8', name: 'VAT 8%', rate: '8', type: 'VAT' }).success,
    ).toBe(true);
    expect(taxRateSchema.safeParse({ code: 'vat', name: 'VAT', rate: 120, type: 'VAT' }).success).toBe(false);
  });

  it('requires positive exchange rates', () => {
    expect(
      exchangeRateSchema.safeParse({
        base: 'USD',
        quote: 'VND',
        rate: 25450,
        effectiveDate: '2026-10-25',
      }).success,
    ).toBe(true);
    expect(
      exchangeRateSchema.safeParse({ base: 'USD', quote: 'VND', rate: 0, effectiveDate: '2026-10-25' })
        .success,
    ).toBe(false);
  });

  it('accepts namespaced setting keys only', () => {
    expect(upsertSettingSchema.safeParse({ key: 'branding.accent', value: 'gold' }).success).toBe(true);
    expect(upsertSettingSchema.safeParse({ key: 'branding accent', value: 'gold' }).success).toBe(false);
  });
});
