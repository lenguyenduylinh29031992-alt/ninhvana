/**
 * NinhVaNa — foundation seed (Phase 1).
 *
 * Creates one group with one NinhVaNa property, the full RBAC catalogue, 15 demo users,
 * rooms across room types, 8 rate plans with 12 months of BAR rates,
 * USALI/TT200 chart of accounts, tax rates, currencies + 24 months of FX,
 * outlets, document templates and sandbox integration configs.
 *
 * Re-running is a no-op unless SEED_FORCE=1 (then the organisation is rebuilt).
 */
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaClient, type DepartmentGroup, type Prisma } from '@prisma/client';
import { seedOperations } from './seed-operations';
import { Algorithm, hash } from '@node-rs/argon2';
import {
  ALL_PERMISSIONS,
  CURRENCY_META,
  PERMISSION_GROUPS,
  ROLES,
  addMonths,
  eachDate,
  isoToday,
  roundTo,
} from '@grand-suite/shared';

for (const candidate of ['../../.env.local', '../../.env', '.env.local', '.env']) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path);
    } catch {
      /* ignore */
    }
    break;
  }
}

const prisma = new PrismaClient();
const DEMO_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'NinhVaNa@2026';
const TODAY = isoToday();

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function seasonFactor(month: number): number {
  const factors = [1.05, 1.0, 0.95, 1.06, 1.0, 1.05, 1.15, 1.15, 1.0, 1.05, 1.02, 1.12];
  return factors[month - 1] ?? 1;
}

function weekdayFactor(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 5 || day === 6 ? 1.15 : day === 0 ? 1.03 : 1;
}

const PROPERTIES = [
  {
    code: 'NVN',
    name: 'Khách sạn NinhVaNa',
    legalName: 'Công ty CP Khách sạn NinhVaNa',
    type: 'HOTEL' as const,
    starRating: 5,
    address: 'Ninh Vân, Ninh Hòa',
    city: 'Khánh Hòa',
    phone: '+84 258 382 9999',
    email: 'hello.ninhvan@ninhvana.vn',
    roomCount: 27,
    taxCode: '0401234567',
    checkInTime: '14:00',
    checkOutTime: '12:00',
    serviceChargePct: 5,
  },
];

type DepartmentSeed = { code: string; name: string; nameEn: string; group: 'ROOMS' | 'FNB' | 'OTHER_OPERATED' | 'ADMIN' | 'SALES' | 'PROPERTY_OPS' | 'UTILITIES' | 'MAINTENANCE'; division: 'HOTEL' | 'RESTAURANT' | 'SHARED'; isRevenueCenter: boolean; sortOrder: number };
const DEPARTMENTS: DepartmentSeed[] = [
  { code: 'ROOMS', name: 'Bộ phận Phòng', nameEn: 'Rooms', group: 'ROOMS', division: 'HOTEL', isRevenueCenter: true, sortOrder: 1 },
  { code: 'FRONT_OFFICE', name: 'Lễ tân', nameEn: 'Front Office', group: 'ROOMS', division: 'HOTEL', isRevenueCenter: false, sortOrder: 2 },
  { code: 'HOUSEKEEPING', name: 'Buồng phòng', nameEn: 'Housekeeping', group: 'ROOMS', division: 'HOTEL', isRevenueCenter: false, sortOrder: 3 },
  { code: 'RESTAURANT', name: 'Nhà hàng', nameEn: 'Restaurant', group: 'FNB', division: 'RESTAURANT', isRevenueCenter: true, sortOrder: 4 },
  { code: 'BAR', name: 'Quầy bar', nameEn: 'Bar', group: 'FNB', division: 'RESTAURANT', isRevenueCenter: true, sortOrder: 5 },
  { code: 'KITCHEN', name: 'Bếp', nameEn: 'Kitchen', group: 'FNB', division: 'RESTAURANT', isRevenueCenter: false, sortOrder: 6 },
  { code: 'ROOM_SERVICE', name: 'Dịch vụ phòng', nameEn: 'Room Service', group: 'FNB', division: 'HOTEL', isRevenueCenter: true, sortOrder: 7 },
  { code: 'BAGALOG', name: 'Bagalog', nameEn: 'Bagalog', group: 'OTHER_OPERATED', division: 'HOTEL', isRevenueCenter: true, sortOrder: 8 },
  { code: 'POOL', name: 'Hồ bơi', nameEn: 'Pool', group: 'OTHER_OPERATED', division: 'HOTEL', isRevenueCenter: true, sortOrder: 9 },
  { code: 'SPA', name: 'Spa & Giải trí', nameEn: 'Spa & Recreation', group: 'OTHER_OPERATED', division: 'HOTEL', isRevenueCenter: true, sortOrder: 10 },
  { code: 'EVENTS', name: 'Tiệc & Hội nghị', nameEn: 'Banquet & Events', group: 'FNB', division: 'RESTAURANT', isRevenueCenter: true, sortOrder: 11 },
  { code: 'FNB', name: 'Ẩm thực & Đồ uống', nameEn: 'Food & Beverage', group: 'FNB', division: 'HOTEL', isRevenueCenter: true, sortOrder: 12 },
  { code: 'SALES', name: 'Kinh doanh & Tiếp thị', nameEn: 'Sales & Marketing', group: 'SALES', division: 'SHARED', isRevenueCenter: false, sortOrder: 13 },
  { code: 'TIKTOK', name: 'Marketing TikTok', nameEn: 'TikTok Marketing', group: 'SALES', division: 'SHARED', isRevenueCenter: false, sortOrder: 14 },
  { code: 'FINANCE', name: 'Tài chính & Kế toán', nameEn: 'Finance & Accounting', group: 'ADMIN', division: 'SHARED', isRevenueCenter: false, sortOrder: 15 },
  { code: 'HR', name: 'Nhân sự', nameEn: 'Human Resources', group: 'ADMIN', division: 'SHARED', isRevenueCenter: false, sortOrder: 16 },
  { code: 'PURCHASING', name: 'Mua hàng & Kho', nameEn: 'Purchasing & Store', group: 'ADMIN', division: 'SHARED', isRevenueCenter: false, sortOrder: 17 },
  { code: 'IT', name: 'Công nghệ thông tin', nameEn: 'Information Technology', group: 'ADMIN', division: 'SHARED', isRevenueCenter: false, sortOrder: 18 },
  { code: 'ADMIN', name: 'Hành chính', nameEn: 'Administration', group: 'ADMIN', division: 'SHARED', isRevenueCenter: false, sortOrder: 19 },
  { code: 'MAINTENANCE', name: 'Bảo trì', nameEn: 'Maintenance', group: 'MAINTENANCE', division: 'SHARED', isRevenueCenter: false, sortOrder: 20 },
  { code: 'UTILITIES', name: 'Năng lượng', nameEn: 'Utilities', group: 'UTILITIES', division: 'SHARED', isRevenueCenter: false, sortOrder: 21 },
  { code: 'PROPERTY_OPS', name: 'Vận hành cơ sở', nameEn: 'Property Operations', group: 'PROPERTY_OPS', division: 'HOTEL', isRevenueCenter: false, sortOrder: 22 },
];

type GlSeed = [string, string, string, 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' | 'COGS', string, string];

const GL_ACCOUNTS: GlSeed[] = [
  ['1000', 'Doanh thu phòng', 'Rooms revenue', 'REVENUE', '1000', '5111'],
  ['2000', 'Doanh thu món ăn', 'Food revenue', 'REVENUE', '2000', '5112'],
  ['2100', 'Doanh thu đồ uống', 'Beverage revenue', 'REVENUE', '2100', '5112'],
  ['2200', 'Doanh thu tiệc & sự kiện', 'Banquet revenue', 'REVENUE', '2200', '5112'],
  ['3000', 'Doanh thu Spa', 'Spa revenue', 'REVENUE', '3000', '5113'],
  ['3100', 'Doanh thu bán lẻ', 'Retail revenue', 'REVENUE', '3100', '5113'],
  ['3200', 'Doanh thu dịch vụ khác', 'Other operated revenue', 'REVENUE', '3200', '5118'],
  ['4000', 'Thu nhập khác', 'Miscellaneous income', 'REVENUE', '4000', '5118'],
  ['4900', 'Chiết khấu & giảm giá', 'Discounts & allowances', 'REVENUE', '4900', '5211'],
  ['5000', 'Giá vốn F&B', 'Cost of food & beverage', 'COGS', '5000', '6322'],
  ['5100', 'Chi phí bộ phận Phòng', 'Rooms departmental expense', 'EXPENSE', '5100', '6321'],
  ['5200', 'Chi phí bộ phận F&B', 'F&B departmental expense', 'EXPENSE', '5200', '6322'],
  ['5300', 'Chi phí bộ phận Spa', 'Spa departmental expense', 'EXPENSE', '5300', '6323'],
  ['6000', 'Lương & phụ cấp', 'Payroll & related', 'EXPENSE', '6000', '6221'],
  ['6010', 'Bảo hiểm & phúc lợi', 'Benefits & insurance', 'EXPENSE', '6010', '6222'],
  ['6100', 'Chi phí điện', 'Electricity', 'EXPENSE', '6100', '6271'],
  ['6110', 'Chi phí nước', 'Water', 'EXPENSE', '6110', '6271'],
  ['6120', 'Gas & nhiên liệu', 'Gas & fuel', 'EXPENSE', '6120', '6271'],
  ['6200', 'Marketing & quảng cáo', 'Sales & marketing', 'EXPENSE', '6200', '6411'],
  ['6210', 'Hoa hồng kênh bán (OTA)', 'Commissions', 'EXPENSE', '6210', '6417'],
  ['6220', 'Phí cổng thanh toán', 'Payment gateway fees', 'EXPENSE', '6220', '6427'],
  ['6300', 'Bảo trì & sửa chữa', 'Repairs & maintenance', 'EXPENSE', '6300', '6272'],
  ['6400', 'Hành chính & văn phòng', 'Administrative & general', 'EXPENSE', '6400', '6421'],
  ['6410', 'Thuê mặt bằng', 'Rent', 'EXPENSE', '6410', '6273'],
  ['6420', 'Bảo hiểm tài sản', 'Property insurance', 'EXPENSE', '6420', '6273'],
  ['6430', 'Thuế, phí & lệ phí', 'Taxes & licences', 'EXPENSE', '6430', '6428'],
  ['6500', 'Khấu hao tài sản', 'Depreciation', 'EXPENSE', '6500', '6274'],
  ['6900', 'Chi phí khác', 'Other expenses', 'EXPENSE', '6900', '6421'],
  ['1110', 'Tiền mặt tại quỹ', 'Cash on hand', 'ASSET', '1110', '111'],
  ['1120', 'Tiền gửi ngân hàng', 'Bank', 'ASSET', '1120', '112'],
  ['1310', 'Phải thu khách hàng', 'Accounts receivable', 'ASSET', '1310', '131'],
  ['1360', 'Phải thu nội bộ', 'Intercompany receivable', 'ASSET', '1360', '136'],
  ['1410', 'Tạm ứng', 'Advances', 'ASSET', '1410', '141'],
  ['1520', 'Nguyên liệu, vật liệu', 'Raw materials inventory', 'ASSET', '1520', '152'],
  ['1560', 'Hàng hoá', 'Merchandise inventory', 'ASSET', '1560', '156'],
  ['2110', 'Tài sản cố định hữu hình', 'Property & equipment', 'ASSET', '2110', '211'],
  ['2140', 'Hao mòn tài sản cố định', 'Accumulated depreciation', 'ASSET', '2140', '214'],
  ['3310', 'Phải trả nhà cung cấp', 'Accounts payable', 'LIABILITY', '3310', '331'],
  ['3331', 'Thuế GTGT phải nộp', 'VAT payable', 'LIABILITY', '2140', '3331'],
  ['3335', 'Thuế thu nhập cá nhân', 'Personal income tax payable', 'LIABILITY', '2140', '3335'],
  ['3340', 'Phải trả người lao động', 'Payroll payable', 'LIABILITY', '3340', '334'],
  ['3380', 'Phải trả khác (BHXH, KPCĐ)', 'Other payables (insurance)', 'LIABILITY', '3380', '338'],
  ['4110', 'Vốn chủ sở hữu', 'Owner equity', 'EQUITY', '4110', '411'],
  ['4210', 'Lợi nhuận sau thuế', 'Retained earnings', 'EQUITY', '4210', '421'],
];

const AMENITIES = [
  ['WIFI', 'Wi-Fi miễn phí', 'Complimentary Wi-Fi', 'wifi'],
  ['AC', 'Điều hoà', 'Air conditioning', 'air-vent'],
  ['TV', 'Smart TV', 'Smart TV', 'tv'],
  ['MINIBAR', 'Minibar', 'Minibar', 'wine'],
  ['SAFE', 'Két an toàn', 'In-room safe', 'lock'],
  ['BATHTUB', 'Bồn tắm', 'Bathtub', 'bath'],
  ['BALCONY', 'Ban công', 'Balcony', 'sun'],
  ['KITCHENETTE', 'Bếp nhỏ', 'Kitchenette', 'cooking-pot'],
  ['WORKSPACE', 'Bàn làm việc', 'Work desk', 'briefcase'],
  ['LOUNGE', 'Quyền lợi Executive Lounge', 'Executive lounge access', 'martini'],
  ['POOL', 'Hồ bơi', 'Pool access', 'waves'],
  ['SPA', 'Spa', 'Spa access', 'flower'],
  ['BREAKFAST', 'Bữa sáng', 'Breakfast', 'coffee'],
  ['PARKING', 'Bãi đỗ xe', 'Parking', 'car'],
] as const;

type RoomTypeSeed = {
  code: string;
  name: string;
  nameEn: string;
  baseRate: number;
  sizeSqm: number;
  bedType: string;
  maxAdults: number;
  maxChildren: number;
  count: number;
  amenities: string[];
};

const ROOM_TYPES: RoomTypeSeed[] = [
  { code: 'STD-Q', name: 'Superior Queen', nameEn: 'Superior Queen', baseRate: 2_650_000, sizeSqm: 32, bedType: 'Queen', maxAdults: 2, maxChildren: 1, count: 30, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'PARKING'] },
  { code: 'STD-T', name: 'Superior Twin', nameEn: 'Superior Twin', baseRate: 2_650_000, sizeSqm: 32, bedType: '2 Twin', maxAdults: 2, maxChildren: 1, count: 30, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'PARKING'] },
  { code: 'DLX-K', name: 'Deluxe King', nameEn: 'Deluxe King', baseRate: 3_200_000, sizeSqm: 42, bedType: 'King', maxAdults: 2, maxChildren: 1, count: 45, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'WORKSPACE', 'POOL'] },
  { code: 'DLX-T', name: 'Deluxe Twin', nameEn: 'Deluxe Twin', baseRate: 3_200_000, sizeSqm: 42, bedType: '2 Twin', maxAdults: 2, maxChildren: 1, count: 35, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'WORKSPACE', 'POOL'] },
  { code: 'PRM-K', name: 'Premier King', nameEn: 'Premier King', baseRate: 4_100_000, sizeSqm: 48, bedType: 'King', maxAdults: 2, maxChildren: 2, count: 25, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'WORKSPACE', 'POOL', 'BATHTUB'] },
  { code: 'PRM-T', name: 'Premier Twin', nameEn: 'Premier Twin', baseRate: 4_100_000, sizeSqm: 48, bedType: '2 Twin', maxAdults: 2, maxChildren: 2, count: 20, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'WORKSPACE', 'POOL', 'BATHTUB'] },
  { code: 'EXE-C', name: 'Executive Club Room', nameEn: 'Executive Club Room', baseRate: 5_600_000, sizeSqm: 55, bedType: 'King', maxAdults: 2, maxChildren: 1, count: 25, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'WORKSPACE', 'POOL', 'BATHTUB', 'LOUNGE'] },
  { code: 'JUN-S', name: 'Junior Suite', nameEn: 'Junior Suite', baseRate: 6_800_000, sizeSqm: 68, bedType: 'King', maxAdults: 3, maxChildren: 2, count: 18, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'WORKSPACE', 'POOL', 'BATHTUB', 'LOUNGE', 'BALCONY'] },
  { code: 'FAM-S', name: 'Family Suite', nameEn: 'Family Suite', baseRate: 7_400_000, sizeSqm: 82, bedType: 'King + 2 Twin', maxAdults: 4, maxChildren: 2, count: 10, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'POOL', 'BATHTUB', 'BALCONY', 'KITCHENETTE'] },
  { code: 'RES-S', name: 'Residence Suite', nameEn: 'Residence Suite', baseRate: 8_900_000, sizeSqm: 96, bedType: 'King', maxAdults: 3, maxChildren: 2, count: 2, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'WORKSPACE', 'POOL', 'BATHTUB', 'LOUNGE', 'BALCONY', 'KITCHENETTE'] },
  { code: 'GDN-V', name: 'Garden Villa', nameEn: 'Garden Villa', baseRate: 9_500_000, sizeSqm: 120, bedType: 'King', maxAdults: 3, maxChildren: 2, count: 6, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'POOL', 'BATHTUB', 'BALCONY', 'KITCHENETTE', 'SPA'] },
  { code: 'PSL-V', name: 'Pool Villa', nameEn: 'Pool Villa', baseRate: 12_500_000, sizeSqm: 160, bedType: 'King', maxAdults: 4, maxChildren: 2, count: 4, amenities: ['WIFI', 'AC', 'TV', 'MINIBAR', 'SAFE', 'BREAKFAST', 'POOL', 'BATHTUB', 'BALCONY', 'KITCHENETTE', 'SPA', 'LOUNGE'] },
];

const RATE_PLANS = [
  { code: 'BAR', name: 'Best Available Rate', type: 'BAR' as const, multiplier: 1, commissionPct: null, inclusions: { breakfast: false } },
  { code: 'CORP', name: 'Giá công ty', type: 'CORPORATE' as const, multiplier: 0.88, commissionPct: null, inclusions: { breakfast: true } },
  { code: 'GROUP', name: 'Giá đoàn (từ 10 phòng)', type: 'GROUP' as const, multiplier: 0.82, commissionPct: null, inclusions: { breakfast: true } },
  { code: 'MEMBER', name: 'Giá thành viên', type: 'MEMBER' as const, multiplier: 0.95, commissionPct: null, inclusions: { breakfast: true, pointsMultiplier: 1.5 } },
  { code: 'PACKAGE-SPA', name: 'Gói Dưỡng sinh (phòng + sáng + spa)', type: 'PACKAGE' as const, multiplier: 1.12, commissionPct: null, inclusions: { breakfast: true, spaCredit: 800000 } },
  { code: 'EARLY', name: 'Đặt sớm 30 ngày', type: 'PROMO' as const, multiplier: 0.85, commissionPct: null, inclusions: { breakfast: true } },
  { code: 'OTA-STD', name: 'OTA Standard (linh hoạt)', type: 'OTA' as const, multiplier: 1.02, commissionPct: 15, inclusions: { breakfast: true } },
  { code: 'OTA-NRF', name: 'OTA Non-refundable', type: 'OTA' as const, multiplier: 0.92, commissionPct: 18, inclusions: { breakfast: true } },
];

const OUTLETS = {
  'NVN': [
    { code: 'NH01', name: 'Le Grand Restaurant', type: 'RESTAURANT' as const, sc: 5, hours: { open: '06:00', close: '22:30' }, sort: 1 },
    { code: 'BAR01', name: 'The Champagne Bar', type: 'BAR' as const, sc: 5, hours: { open: '16:00', close: '01:00' }, sort: 2 },
    { code: 'RS01', name: 'Room Service', type: 'ROOM_SERVICE' as const, sc: 5, hours: { open: '00:00', close: '23:59' }, sort: 3 },
    { code: 'SPA01', name: 'Grand Spa', type: 'SPA' as const, sc: 5, hours: { open: '09:00', close: '21:00' }, sort: 4 },
    { code: 'POOL01', name: 'Pool Bar', type: 'POOL' as const, sc: 5, hours: { open: '08:00', close: '19:00' }, sort: 5 },
    { code: 'BAN01', name: 'Grand Ballroom', type: 'BANQUET' as const, sc: 10, hours: null, sort: 6 },
    { code: 'LJ01', name: 'Le Jardin Fine Dining', type: 'RESTAURANT' as const, sc: 5, hours: { open: '11:00', close: '23:00' }, sort: 7 },
    { code: 'LJBAR', name: 'Le Jardin Terrace Bar', type: 'BAR' as const, sc: 5, hours: { open: '16:00', close: '00:00' }, sort: 8 },
  ],
};

const DEMO_USERS = [
  { email: 'admin@ninhvana.vn', fullName: 'Nguyễn Văn A', role: 'SUPER_ADMIN', property: null, phone: '+84 90 000 0001' },
  { email: 'chairman@ninhvana.vn', fullName: 'Nguyễn Văn B', role: 'CHAIRMAN', property: null, phone: '+84 90 000 0002' },
  { email: 'ceo@ninhvana.vn', fullName: 'Nguyễn Văn C', role: 'CEO', property: null, phone: '+84 90 000 0003' },
  { email: 'cfo@ninhvana.vn', fullName: 'Nguyễn Văn D', role: 'CFO', property: null, phone: '+84 90 000 0004' },
  { email: 'revenue@ninhvana.vn', fullName: 'Nguyễn Văn E', role: 'REVENUE_DIRECTOR', property: null, phone: '+84 90 000 0005' },
  { email: 'manager.hanoi@ninhvana.vn', fullName: 'Nguyễn Văn F', role: 'PROPERTY_MANAGER', property: 'NVN', phone: '+84 90 000 0006' },
  { email: 'manager.ninhvan@ninhvana.vn', fullName: 'Nguyễn Văn G', role: 'PROPERTY_MANAGER', property: 'NVN', phone: '+84 90 000 0007' },
  { email: 'frontdesk@ninhvana.vn', fullName: 'Nguyễn Văn H', role: 'FRONT_DESK', property: 'NVN', phone: '+84 90 000 0008' },
  { email: 'housekeeping@ninhvana.vn', fullName: 'Nguyễn Văn I', role: 'HOUSEKEEPING', property: 'NVN', phone: '+84 90 000 0009' },
  { email: 'chef@ninhvana.vn', fullName: 'Nguyễn Văn J', role: 'EXEC_CHEF', property: 'NVN', phone: '+84 90 000 0010' },
  { email: 'fnb@ninhvana.vn', fullName: 'Nguyễn Văn K', role: 'FNB_MANAGER', property: 'NVN', phone: '+84 90 000 0011' },
  { email: 'cashier@ninhvana.vn', fullName: 'Nguyễn Văn L', role: 'CASHIER', property: 'NVN', phone: '+84 90 000 0012' },
  { email: 'hr@ninhvana.vn', fullName: 'Nguyễn Văn M', role: 'HR_MANAGER', property: null, phone: '+84 90 000 0013' },
  { email: 'warehouse@ninhvana.vn', fullName: 'Nguyễn Văn N', role: 'WAREHOUSE', property: 'NVN', phone: '+84 90 000 0014' },
  { email: 'marketing@ninhvana.vn', fullName: 'Nguyễn Văn O', role: 'MARKETING', property: null, phone: '+84 90 000 0015' },
];

const SETTINGS: Array<{ scope: string; key: string; value: Prisma.InputJsonValue; category: string; description?: string }> = [
  { scope: 'ORG', key: 'branding.displayName', value: 'NinhVaNa', category: 'branding' },
  { scope: 'ORG', key: 'branding.accentColor', value: '#B08D57', category: 'branding' },
  { scope: 'ORG', key: 'finance.baseCurrency', value: 'VND', category: 'finance' },
  { scope: 'ORG', key: 'finance.fiscalYearStartMonth', value: 1, category: 'finance' },
  { scope: 'ORG', key: 'approval.thresholds', value: { propertyManager: 5_000_000, cfo: 50_000_000, ceo: 500_000_000 }, category: 'approval' },
  { scope: 'ORG', key: 'security.sessionTimeoutMinutes', value: 15, category: 'security' },
  { scope: 'ORG', key: 'security.maxLoginAttempts', value: 5, category: 'security' },
  { scope: 'ORG', key: 'nightAudit.autoRunTime', value: '02:30', category: 'operations' },
  { scope: 'ORG', key: 'nightAudit.cutoffHour', value: 6, category: 'operations' },
  { scope: 'ORG', key: 'housekeeping.autoDirtyOnCheckout', value: true, category: 'operations' },
  { scope: 'ORG', key: 'pos.requireTableForDineIn', value: true, category: 'operations' },
  { scope: 'ORG', key: 'notifications.dailyReportEnabled', value: true, category: 'notifications' },
  { scope: 'ORG', key: 'notifications.recipients', value: ['ceo@ninhvana.vn', 'cfo@ninhvana.vn'], category: 'notifications' },
  { scope: 'ORG', key: 'loyalty.pointsPerVnd', value: 0.0001, category: 'loyalty' },
  { scope: 'NVN', key: 'rooms.checkInTime', value: '14:00', category: 'rooms' },
  { scope: 'NVN', key: 'rooms.checkOutTime', value: '12:00', category: 'rooms' },
  { scope: 'NVN', key: 'rooms.smokingFloors', value: [2], category: 'rooms' },
  { scope: 'NVN', key: 'pos.serviceChargePct', value: 5, category: 'pos' },
  { scope: 'NVN', key: 'pos.turnTimeMinutes', value: 90, category: 'pos' },
];

const INTEGRATIONS: Array<[string, string, string]> = [
  ['BOOKING_COM', 'OTA', 'Booking.com'],
  ['AGODA', 'OTA', 'Agoda'],
  ['EXPEDIA', 'OTA', 'Expedia'],
  ['AIRBNB', 'OTA', 'Airbnb'],
  ['TRAVELOKA', 'OTA', 'Traveloka'],
  ['TRIP_COM', 'OTA', 'Trip.com'],
  ['GOOGLE_HOTEL_ADS', 'OTA', 'Google Hotel Ads'],
  ['TRIPADVISOR', 'OTA', 'Tripadvisor'],
  ['FACEBOOK', 'SOCIAL', 'Facebook Page & Messenger'],
  ['INSTAGRAM', 'SOCIAL', 'Instagram DM'],
  ['ZALO', 'SOCIAL', 'Zalo OA'],
  ['WHATSAPP', 'SOCIAL', 'WhatsApp Business'],
  ['TIKTOK', 'SOCIAL', 'TikTok Business'],
  ['TELEGRAM', 'SOCIAL', 'Telegram'],
  ['LINE', 'SOCIAL', 'LINE OA'],
  ['KAKAOTALK', 'SOCIAL', 'KakaoTalk Channel'],
  ['WECHAT', 'SOCIAL', 'WeChat OA'],
  ['VNPAY', 'PAYMENT', 'VNPay'],
  ['MOMO', 'PAYMENT', 'MoMo'],
  ['ZALOPAY', 'PAYMENT', 'ZaloPay'],
  ['STRIPE', 'PAYMENT', 'Stripe'],
  ['VIETQR', 'PAYMENT', 'VietQR'],
  ['VNPT', 'EINVOICE', 'VNPT e-Invoice'],
  ['VIETTEL', 'EINVOICE', 'Viettel e-Invoice'],
  ['MISA', 'EINVOICE', 'MISA meInvoice'],
  ['SMTP', 'EMAIL', 'Email delivery (SMTP)'],
  ['OCR', 'OCR', 'Document OCR'],
  ['LOCK', 'LOCK', 'Smart lock bridge'],
];

const FOLIO_TEMPLATE = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>
body{font-family:Georgia,serif;color:#1a1714;padding:32px}
.brand{font-size:22px;letter-spacing:.18em;color:#B08D57}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:8px 4px;border-bottom:1px solid #e5dfd4;font-size:13px;text-align:left}
td.amount{text-align:right;font-variant-numeric:tabular-nums}
h1{font-size:26px;margin:8px 0}
.muted{color:#6e655b;font-size:12px}
</style></head><body>
<div class="brand">NINHVANA</div>
<div class="muted">{{property.name}} · {{property.address}} · {{property.phone}}</div>
<h1>Folio {{folio.number}}</h1>
<div class="muted">Khách: {{guest.name}} · Phòng: {{room.number}} · Ngày: {{folio.date}}</div>
<table><thead><tr><th>Diễn giải</th><th>Ngày</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
<tbody>{{#each items}}<tr><td>{{description}}</td><td>{{businessDate}}</td><td>{{quantity}}</td><td class="amount">{{unitPrice}}</td><td class="amount">{{amount}}</td></tr>{{/each}}</tbody></table>
<table><tr><td>Tổng trước thuế</td><td class="amount">{{totals.net}}</td></tr>
<tr><td>Phí dịch vụ</td><td class="amount">{{totals.serviceCharge}}</td></tr>
<tr><td>VAT</td><td class="amount">{{totals.vat}}</td></tr>
<tr><td><strong>Tổng cộng</strong></td><td class="amount"><strong>{{totals.total}}</strong></td></tr></table>
<p class="muted">Cảm ơn Quý khách đã lựa chọn NinhVaNa. Hoá đơn điện tử có thể tải tại cổng tra cứu.</p>
</body></html>`;

const INVOICE_TEMPLATE = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;color:#1a1714;padding:32px}
.brand{font-size:20px;letter-spacing:.16em;color:#B08D57}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:8px 4px;border-bottom:1px solid #e5dfd4;font-size:12px;text-align:left}
td.amount{text-align:right;font-variant-numeric:tabular-nums}
</style></head><body>
<div class="brand">NINHVANA</div>
<h2>HOÁ ĐƠN GIÁ TRỊ GIA TĂNG</h2>
<div>Số: {{invoice.number}} · Ngày: {{invoice.issuedAt}}</div>
<div>Người mua: {{buyer.name}} · MST: {{buyer.taxCode}}</div>
<table><thead><tr><th>Mô tả</th><th>SL</th><th>Đơn giá</th><th>VAT</th><th>Thành tiền</th></tr></thead>
<tbody>{{#each lines}}<tr><td>{{description}}</td><td>{{quantity}}</td><td class="amount">{{unitPrice}}</td><td>{{taxRate}}%</td><td class="amount">{{amount}}</td></tr>{{/each}}</tbody></table>
<table><tr><td>Cộng tiền hàng</td><td class="amount">{{totals.net}}</td></tr>
<tr><td>Thuế GTGT</td><td class="amount">{{totals.vat}}</td></tr>
<tr><td><strong>Tổng thanh toán</strong></td><td class="amount"><strong>{{totals.total}}</strong></td></tr></table>
<p style="font-size:11px;color:#6e655b">Hoá đơn điện tử được phát hành theo Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC.</p>
</body></html>`;

async function main(): Promise<void> {
  const startedAt = Date.now();
  const existing = await prisma.organization.findFirst({ where: { name: 'NinhVaNa Group' } });
  if (existing && process.env.SEED_FORCE !== '1') {
    console.log('• Dữ liệu đã tồn tại — bỏ qua seed (đặt SEED_FORCE=1 để tạo lại).');
    return;
  }
  if (existing) {
    // TRUNCATE bypasses the audit append-only trigger (row-level DELETE would be
    // blocked on purpose). Only the seeding tool uses this destructive path.
    console.log('• SEED_FORCE=1: xoá dữ liệu cũ (TRUNCATE CASCADE) và dựng lại…');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Organization" CASCADE');
  }

  const org = await prisma.organization.create({
    data: {
      name: 'NinhVaNa Group',
      legalName: 'Tập đoàn Khách sạn & Nhà hàng NinhVaNa',
      taxCode: '0100000001',
      address: '1 Đường Tràng Tiền, Hoàn Kiếm, Hà Nội',
      phone: '+84 24 3936 8888',
      email: 'hello@ninhvana.vn',
      baseCurrency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
    },
  });

  // Currencies
  for (const [index, [code, meta]] of Object.entries(CURRENCY_META).entries()) {
    await prisma.currency.upsert({
      where: { code },
      update: { name: meta.name, nameEn: meta.nameEn, symbol: meta.symbol, decimals: meta.decimals },
      create: {
        code,
        name: meta.name,
        nameEn: meta.nameEn,
        symbol: meta.symbol,
        decimals: meta.decimals,
        sortOrder: index,
      },
    });
  }

  // Permissions + roles (single source: packages/shared/src/rbac.ts)
  const permissionIds = new Map<string, string>();
  for (const code of ALL_PERMISSIONS) {
    const [resource, action] = code.split(':');
    const group = PERMISSION_GROUPS.find((candidate) => candidate.match.test(code));
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { resource: resource ?? code, action: action ?? '', category: group?.key ?? 'general' },
      create: {
        orgId: org.id,
        code,
        resource: resource ?? code,
        action: action ?? '',
        category: group?.key ?? 'general',
        description: group?.label,
      },
    });
    permissionIds.set(code, permission.id);
  }

  const roleIds = new Map<string, string>();
  for (const role of ROLES) {
    const record = await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        nameEn: role.nameEn,
        description: role.description,
        scope: role.scope,
        level: role.level,
      },
      create: {
        code: role.code,
        name: role.name,
        nameEn: role.nameEn,
        description: role.description,
        scope: role.scope,
        level: role.level,
      },
    });
    roleIds.set(role.code, record.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions
        .map((code) => permissionIds.get(code))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: record.id, permissionId })),
      skipDuplicates: true,
    });
  }

  // Chart of accounts (USALI ↔ TT200)
  for (const [index, [code, name, nameEn, type, usaliCode, vasCode]] of GL_ACCOUNTS.entries()) {
    await prisma.glAccount.upsert({
      where: { orgId_code: { orgId: org.id, code } },
      update: { name, nameEn, type, usaliCode, vasCode, sortOrder: index },
      create: { orgId: org.id, code, name, nameEn, type, usaliCode, vasCode, sortOrder: index },
    });
  }

  // Tax rates — configurable, not hardcoded in services.
  const TAX_RATES = [
    { code: 'VAT8', name: 'VAT 8% (lưu trú, ăn uống)', rate: 8, type: 'VAT' as const, gl: '3331' },
    { code: 'VAT10', name: 'VAT 10% (tiêu chuẩn)', rate: 10, type: 'VAT' as const, gl: '3331' },
    { code: 'VAT5', name: 'VAT 5%', rate: 5, type: 'VAT' as const, gl: '3331' },
    { code: 'VAT0', name: 'VAT 0% (miễn thuế)', rate: 0, type: 'VAT' as const, gl: '3331' },
    { code: 'SERVICE5', name: 'Phí dịch vụ 5%', rate: 5, type: 'SERVICE_CHARGE' as const, gl: '3380' },
    { code: 'SERVICE10', name: 'Phí dịch vụ 10% (tiệc)', rate: 10, type: 'SERVICE_CHARGE' as const, gl: '3380' },
    { code: 'LODGING_FEE', name: 'Phí lưu trú (địa phương)', rate: 0, type: 'LODGING' as const, gl: '3331' },
  ];
  for (const tax of TAX_RATES) {
    await prisma.taxRate.upsert({
      where: { orgId_code: { orgId: org.id, code: tax.code } },
      update: { name: tax.name, rate: tax.rate, type: tax.type, glAccountCode: tax.gl, isActive: tax.code !== 'LODGING_FEE' },
      create: {
        orgId: org.id,
        code: tax.code,
        name: tax.name,
        rate: tax.rate,
        type: tax.type,
        glAccountCode: tax.gl,
        isActive: tax.code !== 'LODGING_FEE',
      },
    });
  }

  // Exchange rates — 24 months, deterministic walk around realistic mid-rates.
  const fxSeeds: Array<[string, number, number]> = [
    ['USD', 25_480, 0.012],
    ['EUR', 27_650, 0.015],
    ['JPY', 171.5, 0.01],
    ['KRW', 18.7, 0.012],
    ['CNY', 3_560, 0.01],
  ];
  const fxRows: Prisma.ExchangeRateCreateManyInput[] = [];
  const fxStart = addMonths(TODAY, -24);
  for (const [quote, baseRate, volatility] of fxSeeds) {
    let rate = baseRate;
    let dayIndex = 0;
    for (const date of eachDate(fxStart, TODAY)) {
      dayIndex += 1;
      const wave = Math.sin(dayIndex / 21) * 0.012 + Math.sin(dayIndex / 71) * 0.02;
      const noise = (Math.sin(dayIndex * 12.9898 + baseRate) * 43758.5453) % 1;
      rate = baseRate * (1 + wave + (noise - 0.5) * volatility);
      fxRows.push({
        orgId: org.id,
        base: quote,
        quote: 'VND',
        rate: roundTo(rate, 4),
        effectiveDate: new Date(`${date}T00:00:00Z`),
        source: 'seed',
      });
    }
  }
  for (const batch of chunk(fxRows, 2000)) {
    await prisma.exchangeRate.createMany({ data: batch, skipDuplicates: true });
  }

  // Properties
  const propertyIds = new Map<string, string>();
  for (const definition of PROPERTIES) {
    const property = await prisma.property.upsert({
      where: { orgId_code: { orgId: org.id, code: definition.code } },
      update: {},
      create: {
        orgId: org.id,
        code: definition.code,
        name: definition.name,
        legalName: definition.legalName,
        type: definition.type,
        starRating: definition.starRating,
        address: definition.address,
        city: definition.city,
        country: 'VN',
        phone: definition.phone,
        email: definition.email,
        roomCount: definition.roomCount,
        taxCode: definition.taxCode,
        checkInTime: definition.checkInTime,
        checkOutTime: definition.checkOutTime,
        serviceChargePct: definition.serviceChargePct,
      },
    });
    propertyIds.set(definition.code, property.id);
  }


  // Property map: zones A–D and floors A1–A3.
  const centralPropertyId = propertyIds.get('NVN');
  if (centralPropertyId) {
    const areas = [
      { code: 'A', parentCode: null, name: 'Khu A — Nhà chính trung tâm', nameEn: 'Zone A — Central House', kind: 'BUILDING', floorLabel: null, roomCount: 27, sortOrder: 1, description: 'Nhà chính của NinhVaNa: đón khách, lưu trú và kết nối ra hồ bơi, view biển.', features: { gate: 'Cổng đón khách', lobby: 'Quầy lễ tân', pool: 'Hồ bơi', seaView: 'View biển' }, departmentGroups: ['ROOMS'] as DepartmentGroup[], departmentCodes: ['ROOMS'] as string[] },
      { code: 'A1', parentCode: 'A', name: 'A1 — Tầng trệt', nameEn: 'A1 — Ground floor', kind: 'FLOOR', floorLabel: 'Tầng trệt', roomCount: 6, sortOrder: 2, description: 'Trước là cổng đón khách; quầy lễ tân đón khách; 6 phòng dormitory giường tầng; phía sau là hồ bơi và view biển.', features: { dormRooms: 6, reception: true, gate: true, pool: true, seaView: true }, departmentGroups: ['ROOMS'] as DepartmentGroup[], departmentCodes: ['ROOMS', 'FRONT_OFFICE'] as string[] },
      { code: 'A2', parentCode: 'A', name: 'A2 — Tầng 2', nameEn: 'A2 — Second floor', kind: 'FLOOR', floorLabel: 'Tầng 2', roomCount: 9, sortOrder: 3, description: '6 phòng dormitory giường tầng, 2 phòng view trước và 1 phòng Connecting room.', features: { dormRooms: 6, viewRooms: 2, connectingRooms: 1 }, departmentGroups: ['ROOMS'] as DepartmentGroup[], departmentCodes: ['ROOMS', 'FRONT_OFFICE'] as string[] },
      { code: 'A3', parentCode: 'A', name: 'A3 — Tầng 3', nameEn: 'A3 — Third floor', kind: 'FLOOR', floorLabel: 'Tầng 3', roomCount: 12, sortOrder: 4, description: '10 phòng đôi, 2 phòng gia đình có gác lửng và 1 sảnh chung.', features: { doubleRooms: 10, familyMezzanineRooms: 2, commonHall: 1 }, departmentGroups: ['ROOMS'] as DepartmentGroup[], departmentCodes: ['ROOMS', 'FRONT_OFFICE'] as string[] },
      { code: 'B', parentCode: null, name: 'Khu B — Bagalog', nameEn: 'Zone B — Bagalog', kind: 'BUILDING', floorLabel: null, roomCount: 0, sortOrder: 5, description: 'Khu Bagalog trong khuôn viên NinhVaNa.', features: {}, departmentGroups: ['OTHER_OPERATED'] as DepartmentGroup[], departmentCodes: ['BAGALOG'] as string[] },
      { code: 'C', parentCode: null, name: 'Khu C — Bếp & Quầy Bar', nameEn: 'Zone C — Kitchen & Bar', kind: 'FNB', floorLabel: null, roomCount: 0, sortOrder: 6, description: 'Khu bếp vận hành và quầy bar phục vụ khách.', features: {}, departmentGroups: ['FNB'] as DepartmentGroup[], departmentCodes: ['RESTAURANT', 'BAR', 'KITCHEN'] as string[] },
      { code: 'D', parentCode: null, name: 'Khu D — Hồ Bơi', nameEn: 'Zone D — Swimming Pool', kind: 'POOL', floorLabel: null, roomCount: 0, sortOrder: 7, description: 'Hồ bơi và khu vực thư giãn ngoài trời.', features: {}, departmentGroups: ['OTHER_OPERATED'] as DepartmentGroup[], departmentCodes: ['POOL'] as string[] },
    ] as const;
    for (const area of areas) {
      await prisma.propertyArea.upsert({
        where: { propertyId_code: { propertyId: centralPropertyId, code: area.code } },
        update: { name: area.name, description: area.description, roomCount: area.roomCount, features: area.features },
        create: { orgId: org.id, propertyId: centralPropertyId, ...area },
      });
    }
  }

  // Marketing workspace: default pillars, each with sub-items.
  if ((await prisma.marketingItem.count({ where: { orgId: org.id } })) === 0) {
    const pillars: Array<{ title: string; description: string; status: string; channel?: string; children: string[] }> = [
      { title: 'Chiến dịch', description: 'Kế hoạch khuyến mãi, ưu đãi theo mùa và theo phân khúc.', status: 'IN_PROGRESS', children: ['Ưu đãi cuối năm', 'Gói Ninh Vân 2N1Đ', 'Tiếp thị lại khách đã ở'] },
      { title: 'Nội dung & thương hiệu', description: 'Lịch nội dung, hình ảnh, câu chuyện thương hiệu NinhVaNa.', status: 'IN_PROGRESS', children: ['Lịch nội dung tháng 11', 'Bộ ảnh Ninh Vân', 'Nhận diện logo & màu sắc'] },
      { title: 'Kênh & đối tác', description: 'OTA, KOL/KOC, báo chí và đối tác phân phối.', status: 'PLANNED', children: ['Booking.com', 'Đánh giá từ KOL Ninh Vân', 'Hợp tác đại lý du lịch'] },
      { title: 'Ngân sách & ROI', description: 'Theo dõi chi phí, hiệu quả và attribution theo kênh.', status: 'PLANNED', children: ['Ngân sách Q4', 'Báo cáo ROI tháng'] },
      { title: 'Chăm sóc khách hàng', description: 'Email, SMS và chương trình khách quay lại.', status: 'PLANNED', children: ['Thư điện tử sau lưu trú', 'Ưu đãi sinh nhật'] },
      { title: 'Kênh TikTok', description: 'Kênh TikTok: lịch đăng, video ngắn, TikTok Shop và hợp tác KOL.', status: 'IN_PROGRESS', channel: 'TikTok', children: ['Lịch đăng TikTok', 'Video ngắn', 'TikTok Shop', 'KOL TikTok'] },
    ];
    for (const [index, pillar] of pillars.entries()) {
      const root = await prisma.marketingItem.create({ data: { orgId: org.id, title: pillar.title, description: pillar.description, status: pillar.status, channel: pillar.channel ?? null, sortOrder: index + 1 } });
      for (const [childIndex, title] of pillar.children.entries()) {
        await prisma.marketingItem.create({ data: { orgId: org.id, parentId: root.id, title, status: 'PLANNED', channel: pillar.channel ?? null, sortOrder: childIndex + 1 } });
      }
    }
  }

  // Settings
  for (const setting of SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { orgId_scope_key: { orgId: org.id, scope: setting.scope, key: setting.key } },
      update: { value: setting.value, category: setting.category },
      create: {
        orgId: org.id,
        scope: setting.scope,
        key: setting.key,
        value: setting.value,
        category: setting.category,
        description: setting.description,
      },
    });
  }

  // Departments — one property, hotel + restaurant + shared services
  for (const [propertyCode, departments] of Object.entries({ NVN: DEPARTMENTS })) {
    const propertyId = propertyIds.get(propertyCode);
    if (!propertyId) continue;
    for (const department of departments) {
      await prisma.department.upsert({
        where: { propertyId_code: { propertyId, code: department.code } },
        update: { name: department.name, nameEn: department.nameEn, group: department.group, division: department.division, isRevenueCenter: department.isRevenueCenter, sortOrder: department.sortOrder },
        create: { propertyId, ...department },
      });
    }
  }

  // Number sequences
  const docTypes: Array<[string, string, number]> = [
    ['RESERVATION', 'RSV', 5],
    ['FOLIO', 'FOL', 5],
    ['INVOICE', 'INV', 5],
    ['PAYMENT', 'PAY', 5],
    ['RECEIPT', 'RCP', 5],
    ['EXPENSE', 'EXP', 4],
    ['PURCHASE_REQUEST', 'PR', 4],
    ['PURCHASE_ORDER', 'PO', 4],
    ['GOODS_RECEIPT', 'GRN', 4],
    ['PAYSLIP', 'PSL', 4],
    ['BEO', 'BEO', 4],
    ['JOURNAL', 'JE', 5],
    ['CASH_SESSION', 'CS', 4],
    ['GUEST', 'G', 5],
    ['POS_ORDER', 'POS', 6],
    ['BILL', 'BILL', 5],
  ];
  for (const [propertyCode, propertyId] of propertyIds) {
    for (const [docType, prefix, padding] of docTypes) {
      await prisma.numberSequence.upsert({
        where: { propertyId_docType: { propertyId, docType } },
        update: { prefix: `${prefix}-${propertyCode.split('-')[1] ?? 'GS'}`, padding },
        create: {
          orgId: org.id,
          propertyId,
          docType,
          prefix: `${prefix}-${propertyCode.split('-')[1] ?? 'GS'}`,
          padding,
        },
      });
    }
  }

  // Outlets
  for (const [propertyCode, outlets] of Object.entries(OUTLETS)) {
    const propertyId = propertyIds.get(propertyCode);
    if (!propertyId) continue;
    for (const outlet of outlets) {
      await prisma.outlet.upsert({
        where: { propertyId_code: { propertyId, code: outlet.code } },
        update: {
          name: outlet.name,
          type: outlet.type,
          serviceChargePct: outlet.sc,
          openingHours: outlet.hours ?? undefined,
        },
        create: {
          propertyId,
          code: outlet.code,
          name: outlet.name,
          type: outlet.type,
          serviceChargePct: outlet.sc,
          openingHours: outlet.hours ?? undefined,
          sortOrder: outlet.sort,
        },
      });
    }
  }

  // Amenities
  const amenityIds = new Map<string, string>();
  for (const [code, name, nameEn, icon] of AMENITIES) {
    const amenity = await prisma.amenity.upsert({
      where: { orgId_code: { orgId: org.id, code } },
      update: { name, nameEn, icon },
      create: { orgId: org.id, code, name, nameEn, icon },
    });
    amenityIds.set(code, amenity.id);
  }

  // Hotel rooms, floors, rate plans
  const hotelId = propertyIds.get('NVN')!;
  const floorCapacity = [32, 32, 31, 31, 31, 31, 31, 31];
  const floors: Array<{ id: string; number: number; capacity: number }> = [];
  for (const [index, capacity] of floorCapacity.entries()) {
    const number = index + 1;
    const floor = await prisma.floor.upsert({
      where: { propertyId_number: { propertyId: hotelId, number } },
      update: { name: `Tầng ${number}` },
      create: { propertyId: hotelId, number, name: `Tầng ${number}`, sortOrder: number },
    });
    floors.push({ id: floor.id, number, capacity });
  }

  const roomTypeIds = new Map<string, string>();
  for (const [index, definition] of ROOM_TYPES.entries()) {
    const roomType = await prisma.roomType.upsert({
      where: { propertyId_code: { propertyId: hotelId, code: definition.code } },
      update: { name: definition.name, baseRate: definition.baseRate },
      create: {
        propertyId: hotelId,
        code: definition.code,
        name: definition.name,
        nameEn: definition.nameEn,
        description: `${definition.sizeSqm}m² · ${definition.bedType} · tối đa ${definition.maxAdults + definition.maxChildren} khách`,
        sizeSqm: definition.sizeSqm,
        bedType: definition.bedType,
        maxAdults: definition.maxAdults,
        maxChildren: definition.maxChildren,
        maxOccupancy: definition.maxAdults + definition.maxChildren,
        baseRate: definition.baseRate,
        extraAdultRate: 850_000,
        extraChildRate: 450_000,
        sortOrder: index,
      },
    });
    roomTypeIds.set(definition.code, roomType.id);
    const amenityRows = definition.amenities
      .map((code) => amenityIds.get(code))
      .filter((id): id is string => Boolean(id))
      .map((amenityId) => ({ roomTypeId: roomType.id, amenityId }));
    await prisma.roomTypeAmenity.createMany({ data: amenityRows, skipDuplicates: true });
  }

  // Rooms: sequential blocks per type across floors.
  const roomRows: Prisma.RoomCreateManyInput[] = [];
  let floorIndex = 0;
  let positionOnFloor = 0;
  const views = ['City view', 'Garden view', 'Pool view', 'Courtyard view'];
  let roomOrdinal = 0;
  for (const definition of ROOM_TYPES) {
    const roomTypeId = roomTypeIds.get(definition.code)!;
    for (let i = 0; i < definition.count; i += 1) {
      while (floorIndex < floors.length && positionOnFloor >= floors[floorIndex]!.capacity) {
        floorIndex += 1;
        positionOnFloor = 0;
      }
      const floor = floors[floorIndex]!;
      positionOnFloor += 1;
      roomOrdinal += 1;
      const number = `${floor.number}${String(positionOnFloor).padStart(2, '0')}`;
      roomRows.push({
        propertyId: hotelId,
        roomTypeId,
        floorId: floor.id,
        number,
        view: views[roomOrdinal % views.length],
        status: roomOrdinal % 17 === 0 ? 'DIRTY' : roomOrdinal === 77 ? 'OUT_OF_ORDER' : 'CLEAN',
        features: { connecting: roomOrdinal % 9 === 0, accessible: roomOrdinal % 23 === 0 },
      });
    }
  }
  for (const batch of chunk(roomRows, 1000)) {
    await prisma.room.createMany({ data: batch, skipDuplicates: true });
  }

  // Rate plans + 12 months of daily rates.
  const rateRows: Prisma.RatePlanRateCreateManyInput[] = [];
  for (const planDefinition of RATE_PLANS) {
    const plan = await prisma.ratePlan.upsert({
      where: { propertyId_code: { propertyId: hotelId, code: planDefinition.code } },
      update: { name: planDefinition.name, commissionPct: planDefinition.commissionPct },
      create: {
        propertyId: hotelId,
        code: planDefinition.code,
        name: planDefinition.name,
        description: `Chính sách giá ${planDefinition.name}`,
        type: planDefinition.type,
        commissionPct: planDefinition.commissionPct,
        inclusions: planDefinition.inclusions,
        cancellationPolicy:
          planDefinition.code === 'OTA-NRF'
            ? { type: 'NON_REFUNDABLE', freeUntilDays: 0 }
            : { type: 'FLEXIBLE', freeUntilDays: 2 },
        depositPolicy: { type: 'PERCENT', value: planDefinition.code === 'OTA-NRF' ? 100 : 30 },
      },
    });

    for (const roomTypeDefinition of ROOM_TYPES) {
      const roomTypeId = roomTypeIds.get(roomTypeDefinition.code)!;
      const from = addMonths(TODAY, -1);
      const to = addMonths(TODAY, 11);
      for (const date of eachDate(from, to)) {
        const month = Number(date.slice(5, 7));
        const raw =
          roomTypeDefinition.baseRate *
          planDefinition.multiplier *
          seasonFactor(month) *
          weekdayFactor(date);
        const amount = Math.round(raw / 10_000) * 10_000;
        rateRows.push({
          ratePlanId: plan.id,
          roomTypeId,
          date: new Date(`${date}T00:00:00Z`),
          amount,
          currency: 'VND',
          closed: false,
          closedToArrival: false,
        });
      }
    }
  }
  for (const batch of chunk(rateRows, 2000)) {
    await prisma.ratePlanRate.createMany({ data: batch, skipDuplicates: true });
  }

  // Users (single password hash — demo password is shared by design)
  const passwordHash = await hash(DEMO_PASSWORD, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const userIds = new Map<string, string>();
  for (const userDefinition of DEMO_USERS) {
    const roleId = roleIds.get(userDefinition.role);
    if (!roleId) throw new Error(`Missing role ${userDefinition.role}`);
    const propertyId = userDefinition.property ? propertyIds.get(userDefinition.property) : null;
    const user = await prisma.user.upsert({
      where: { email: userDefinition.email },
      update: {
        fullName: userDefinition.fullName,
        phone: userDefinition.phone,
        isActive: true,
      },
      create: {
        orgId: org.id,
        email: userDefinition.email,
        passwordHash,
        fullName: userDefinition.fullName,
        phone: userDefinition.phone,
        locale: 'vi',
      },
    });
    userIds.set(userDefinition.email, user.id);
    await prisma.userPropertyRole.deleteMany({ where: { userId: user.id } });
    await prisma.userPropertyRole.create({
      data: { userId: user.id, roleId, propertyId: propertyId ?? null, isPrimary: true },
    });
  }

  // Channels, companies, guest directory, menus and POS tables
  const operations = await seedOperations(prisma, org.id, propertyIds);
  console.log(`  Vận hành    : ${operations.channels} kênh · ${operations.guests} khách · ${operations.menuItems} món · ${operations.tables} bàn`);

  // Document templates
  await prisma.documentTemplate.deleteMany({ where: { orgId: org.id } });
  await prisma.documentTemplate.createMany({
    data: [
      { orgId: org.id, type: 'FOLIO', name: 'Mẫu Folio chuẩn', locale: 'vi', contentHtml: FOLIO_TEMPLATE, isDefault: true },
      { orgId: org.id, type: 'INVOICE', name: 'Mẫu hoá đơn GTGT', locale: 'vi', contentHtml: INVOICE_TEMPLATE, isDefault: true },
    ],
  });

  // Sandbox integrations — credentials are never seeded.
  for (const [provider, category, displayName] of INTEGRATIONS) {
    await prisma.integrationConfig.upsert({
      where: { orgId_provider: { orgId: org.id, provider } },
      update: { displayName, category },
      create: {
        orgId: org.id,
        provider,
        category,
        displayName,
        status: 'SANDBOX',
        settings: { mode: 'mock', note: 'Cấu hình API key thật trong màn hình Tích hợp.' },
      },
    });
  }

  // Onboarding notification for the administrator
  await prisma.notification.create({
    data: {
      orgId: org.id,
      userId: userIds.get('admin@ninhvana.vn')!,
      type: 'system.welcome',
      title: 'NinhVaNa đã sẵn sàng',
      body: 'Nền tảng đã được khởi tạo với 2 cơ sở, 250 phòng và 15 tài khoản demo.',
      severity: 'SUCCESS',
      link: '/dashboard',
    },
  });

  // First audit record — starts the tamper-evident hash chain.
  // The canonical shape must match AuditService.record() exactly.
  const seededAt = new Date();
  const seedAfter = {
    properties: PROPERTIES.length,
    rooms: roomRows.length,
    roomTypes: ROOM_TYPES.length,
    users: DEMO_USERS.length,
  };
  const canonical = {
    orgId: org.id,
    propertyId: null,
    actorId: userIds.get('admin@ninhvana.vn')!,
    action: 'system.seed',
    entityType: 'System',
    entityId: null,
    reason: null,
    before: null,
    after: seedAfter,
    metadata: { source: 'seed' },
    requestId: null,
    createdAt: seededAt.toISOString(),
  };
  const hashSelf = createHash('sha256')
    .update(`genesis|${stableStringify(canonical)}`)
    .digest('hex');
  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorId: userIds.get('admin@ninhvana.vn'),
      actorName: 'Quản trị hệ thống',
      actorRole: 'SUPER_ADMIN',
      action: 'system.seed',
      entityType: 'System',
      after: seedAfter,
      hashPrev: null,
      hashSelf,
      metadata: { source: 'seed' },
      createdAt: seededAt,
    },
  });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('');
  console.log('  NinhVaNa — seed hoàn tất');
  console.log(`  Tổ chức      : ${org.name}`);
  console.log(`  Cơ sở        : ${PROPERTIES.map((p) => p.code).join(', ')}`);
  console.log(`  Phòng        : ${roomRows.length} (${ROOM_TYPES.length} hạng)`);
  console.log(`  Gói giá      : ${RATE_PLANS.length} · ${rateRows.length.toLocaleString('vi-VN')} dòng giá/ngày`);
  console.log(`  Nhân sự demo : ${DEMO_USERS.length} tài khoản (mật khẩu ${DEMO_PASSWORD})`);
  console.log(`  Tài khoản COA: ${GL_ACCOUNTS.length} · Tỷ giá: ${fxRows.length.toLocaleString('vi-VN')} dòng`);
  console.log(`  Thời gian    : ${elapsed}s`);
  console.log('');
}

main()
  .catch((error) => {
    console.error('Seed thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
