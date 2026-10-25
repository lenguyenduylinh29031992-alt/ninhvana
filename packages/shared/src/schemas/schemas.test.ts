import { describe, expect, it } from 'vitest';
import {
  bookingAvailabilityQuerySchema, channelPushSchema, channelWebhookSchema, expenseCreateSchema,
  inboxReplySchema, payrollRunSchema, publicBookingSchema, purchaseRequestSchema, supplierInvoiceSchema,
} from './index';
import { loginSchema, passwordSchema } from './auth';
import { createUserSchema } from './iam';
import { paginationSchema } from './common';
import { createPropertySchema } from './property';
import { taxRateSchema, exchangeRateSchema, upsertSettingSchema } from './settings';

describe('login schema', () => {
  it('normalises email casing and trims it', () => {
    const parsed = loginSchema.parse({ email: '  CEO@NinhVaNa.VN ', password: 'x' });
    expect(parsed.email).toBe('ceo@ninhvana.vn');
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
    expect(passwordSchema.safeParse('NinhVaNa@2026').success).toBe(true);
  });
});

describe('user creation', () => {
  const base = {
    email: 'frontdesk@ninhvana.vn',
    fullName: 'Nguyễn Thị Lễ Tân',
    password: 'NinhVaNa@2026',
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
    code: 'nvn-han',
    name: 'Khách sạn NinhVaNa',
    type: 'HOTEL',
    address: '1 Đường Tràng Tiền',
    city: 'Hà Nội',
  };

  it('uppercases the code and fills defaults', () => {
    const parsed = createPropertySchema.parse(property);
    expect(parsed.code).toBe('NVN-HAN');
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

describe('channel, booking and finance schemas', () => {
  it('validates a webhook payload and rejects missing room type', () => {
    const payload = {
      externalId: 'EXT-1', status: 'confirmed', propertyCode: 'NVN-HAN', roomTypeCode: 'DLX-K',
      checkIn: '2026-11-10', checkOut: '2026-11-12', guest: { firstName: 'A', lastName: 'B', email: 'a@b.com' }, adults: 2, children: 0,
    };
    expect(channelWebhookSchema.parse(payload).externalId).toBe('EXT-1');
    expect(() => channelWebhookSchema.parse({ ...payload, roomTypeCode: '' })).toThrow();
  });

  it('validates public booking and rejects an inverted stay', () => {
    const base = {
      propertyCode: 'NVN-HAN', checkIn: '2026-12-10', checkOut: '2026-12-12', roomTypeId: 'rt1', adults: 2, children: 0,
      guest: { firstName: 'Website', lastName: 'Guest', email: 'web@example.com', phone: '+84909123456' },
    };
    expect(publicBookingSchema.parse(base).adults).toBe(2);
    expect(() => publicBookingSchema.parse({ ...base, checkOut: '2026-12-09' })).toThrow();
  });

  it('validates availability and report-safe date ranges', () => {
    expect(bookingAvailabilityQuerySchema.parse({ propertyCode: 'NVN-HAN', checkIn: '2026-12-10', checkOut: '2026-12-12' }).adults).toBe(2);
    expect(() => channelPushSchema.parse({ days: 0 })).toThrow();
    expect(channelPushSchema.parse({})).toMatchObject({ days: 7, simulateFailure: false });
  });

  it('validates supplier invoice, expense and payroll inputs', () => {
    expect(supplierInvoiceSchema.parse({ propertyId: 'p1', supplierId: 's1', number: 'SI-1', invoiceDate: '2026-10-01', dueDate: '2026-10-31', subtotal: 100, vatAmount: 8, accountCode: '6100', description: 'Điện' }).vatAmount).toBe(8);
    expect(expenseCreateSchema.parse({ propertyId: 'p1', accountCode: '6900', department: 'ADMIN', description: 'Khác', amount: 10 })).toMatchObject({ vatAmount: 0, paymentMethod: 'BANK_TRANSFER' });
    expect(payrollRunSchema.parse({ propertyId: 'p1', period: '2026-10' }).period).toBe('2026-10');
    expect(() => payrollRunSchema.parse({ propertyId: 'p1', period: '2026/10' })).toThrow();
    expect(() => purchaseRequestSchema.parse({ propertyId: 'p1', department: 'FNB', lines: [] })).toThrow();
    expect(inboxReplySchema.parse({ body: 'Xin chào' }).body).toBe('Xin chào');
  });
});
