export const APP_NAME = 'NinhVaNa';
export const APP_TAGLINE = 'Hệ thống Quản trị Khách sạn & Nhà hàng';
export const DEFAULT_LOCALE = 'vi' as const;
export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const BASE_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Cookie & header names — API sets them, browser client reads them. */
export const COOKIE_NAMES = {
  ACCESS: 'gs_at',
  REFRESH: 'gs_rt',
  CSRF: 'gs_csrf',
  LOCALE: 'gs_locale',
  THEME: 'gs_theme',
} as const;

export const HEADERS = {
  CSRF: 'x-csrf-token',
  PROPERTY: 'x-property-id',
  REQUEST_ID: 'x-request-id',
  LOCALE: 'x-locale',
} as const;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const MFA_TOKEN_TTL_SECONDS = 5 * 60;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;
export const PASSWORD_MIN_LENGTH = 10;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 200,
} as const;

export const DEPARTMENTS = {
  ROOMS: 'ROOMS',
  FOOD: 'FOOD',
  BEVERAGE: 'BEVERAGE',
  SPA: 'SPA',
  EVENTS: 'EVENTS',
  RETAIL: 'RETAIL',
  OTHER: 'OTHER',
  ADMIN: 'ADMIN',
  SALES: 'SALES',
  PROPERTY_OPS: 'PROPERTY_OPS',
  UTILITIES: 'UTILITIES',
  MAINTENANCE: 'MAINTENANCE',
} as const;

export const DEPARTMENT_LABELS: Record<string, { vi: string; en: string }> = {
  ROOMS: { vi: 'Phòng', en: 'Rooms' },
  FOOD: { vi: 'Nhà hàng', en: 'Food' },
  BEVERAGE: { vi: 'Bar', en: 'Beverage' },
  SPA: { vi: 'Spa', en: 'Spa' },
  EVENTS: { vi: 'Sự kiện', en: 'Events' },
  RETAIL: { vi: 'Bán lẻ', en: 'Retail' },
  OTHER: { vi: 'Dịch vụ khác', en: 'Other' },
  ADMIN: { vi: 'Hành chính', en: 'Administrative' },
  SALES: { vi: 'Marketing & Sales', en: 'Sales & Marketing' },
  PROPERTY_OPS: { vi: 'Vận hành cơ sở', en: 'Property Operations' },
  UTILITIES: { vi: 'Năng lượng', en: 'Utilities' },
  MAINTENANCE: { vi: 'Bảo trì', en: 'Maintenance' },
};

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  VIETQR: 'VIETQR',
  VNPAY: 'VNPAY',
  MOMO: 'MOMO',
  ZALO_PAY: 'ZALO_PAY',
  STRIPE: 'STRIPE',
  COMPANY_AR: 'COMPANY_AR',
  LOYALTY_POINTS: 'LOYALTY_POINTS',
  CITY_LEDGER: 'CITY_LEDGER',
} as const;

export const PAYMENT_METHOD_LABELS: Record<string, { vi: string; en: string }> = {
  CASH: { vi: 'Tiền mặt', en: 'Cash' },
  CARD: { vi: 'Thẻ', en: 'Card' },
  BANK_TRANSFER: { vi: 'Chuyển khoản', en: 'Bank transfer' },
  VIETQR: { vi: 'VietQR', en: 'VietQR' },
  VNPAY: { vi: 'VNPay', en: 'VNPay' },
  MOMO: { vi: 'MoMo', en: 'MoMo' },
  ZALO_PAY: { vi: 'ZaloPay', en: 'ZaloPay' },
  STRIPE: { vi: 'Stripe', en: 'Stripe' },
  COMPANY_AR: { vi: 'Công nợ công ty', en: 'Company account' },
  LOYALTY_POINTS: { vi: 'Điểm thưởng', en: 'Loyalty points' },
  CITY_LEDGER: { vi: 'City ledger', en: 'City ledger' },
};

export const CHANNELS = {
  DIRECT: 'DIRECT',
  BOOKING_COM: 'BOOKING_COM',
  AGODA: 'AGODA',
  EXPEDIA: 'EXPEDIA',
  AIRBNB: 'AIRBNB',
  TRAVELOKA: 'TRAVELOKA',
  TRIP_COM: 'TRIP_COM',
  GOOGLE_HOTEL_ADS: 'GOOGLE_HOTEL_ADS',
  TRIPADVISOR: 'TRIPADVISOR',
  FACEBOOK: 'FACEBOOK',
  INSTAGRAM: 'INSTAGRAM',
  ZALO: 'ZALO',
  TIKTOK: 'TIKTOK',
  WHATSAPP: 'WHATSAPP',
  TELEGRAM: 'TELEGRAM',
  LINE: 'LINE',
  KAKAOTALK: 'KAKAOTALK',
  WECHAT: 'WECHAT',
  WALK_IN: 'WALK_IN',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  TRAVEL_AGENT: 'TRAVEL_AGENT',
  CORPORATE: 'CORPORATE',
  GROUP_MICE: 'GROUP_MICE',
  REFERRAL: 'REFERRAL',
} as const;

export const CHANNEL_LABELS: Record<string, { vi: string; en: string; kind: 'OTA' | 'SOCIAL' | 'DIRECT' | 'OFFLINE' }> = {
  DIRECT: { vi: 'Website trực tiếp', en: 'Direct website', kind: 'DIRECT' },
  BOOKING_COM: { vi: 'Booking.com', en: 'Booking.com', kind: 'OTA' },
  AGODA: { vi: 'Agoda', en: 'Agoda', kind: 'OTA' },
  EXPEDIA: { vi: 'Expedia', en: 'Expedia', kind: 'OTA' },
  AIRBNB: { vi: 'Airbnb', en: 'Airbnb', kind: 'OTA' },
  TRAVELOKA: { vi: 'Traveloka', en: 'Traveloka', kind: 'OTA' },
  TRIP_COM: { vi: 'Trip.com', en: 'Trip.com', kind: 'OTA' },
  GOOGLE_HOTEL_ADS: { vi: 'Google Hotel Ads', en: 'Google Hotel Ads', kind: 'OTA' },
  TRIPADVISOR: { vi: 'Tripadvisor', en: 'Tripadvisor', kind: 'OTA' },
  FACEBOOK: { vi: 'Facebook', en: 'Facebook', kind: 'SOCIAL' },
  INSTAGRAM: { vi: 'Instagram', en: 'Instagram', kind: 'SOCIAL' },
  ZALO: { vi: 'Zalo OA', en: 'Zalo OA', kind: 'SOCIAL' },
  TIKTOK: { vi: 'TikTok', en: 'TikTok', kind: 'SOCIAL' },
  WHATSAPP: { vi: 'WhatsApp', en: 'WhatsApp', kind: 'SOCIAL' },
  TELEGRAM: { vi: 'Telegram', en: 'Telegram', kind: 'SOCIAL' },
  LINE: { vi: 'LINE', en: 'LINE', kind: 'SOCIAL' },
  KAKAOTALK: { vi: 'KakaoTalk', en: 'KakaoTalk', kind: 'SOCIAL' },
  WECHAT: { vi: 'WeChat', en: 'WeChat', kind: 'SOCIAL' },
  WALK_IN: { vi: 'Khách đến trực tiếp', en: 'Walk-in', kind: 'OFFLINE' },
  PHONE: { vi: 'Hotline', en: 'Phone', kind: 'OFFLINE' },
  EMAIL: { vi: 'Email', en: 'Email', kind: 'OFFLINE' },
  TRAVEL_AGENT: { vi: 'Đại lý du lịch', en: 'Travel agent', kind: 'OFFLINE' },
  CORPORATE: { vi: 'Công ty', en: 'Corporate', kind: 'OFFLINE' },
  GROUP_MICE: { vi: 'Đoàn / MICE', en: 'Group / MICE', kind: 'OFFLINE' },
  REFERRAL: { vi: 'Giới thiệu', en: 'Referral', kind: 'OFFLINE' },
};

export const ROOM_STATUS_LABELS: Record<string, { vi: string; en: string; tone: string }> = {
  CLEAN: { vi: 'Sạch', en: 'Clean', tone: 'success' },
  DIRTY: { vi: 'Bẩn', en: 'Dirty', tone: 'warning' },
  INSPECTED: { vi: 'Đã kiểm tra', en: 'Inspected', tone: 'success' },
  OUT_OF_ORDER: { vi: 'Ngừng bán', en: 'Out of order', tone: 'danger' },
  OUT_OF_SERVICE: { vi: 'Bảo trì', en: 'Out of service', tone: 'info' },
};

export const USALI_GROUPS = [
  'ROOMS',
  'FNB',
  'OTHER_OPERATED',
  'MISCELLANEOUS',
  'ADMIN',
  'SALES',
  'PROPERTY_OPS',
  'UTILITIES',
  'MAINTENANCE',
  'FIXED',
] as const;

export const CURRENCY_OPTIONS = [
  { code: 'VND', decimals: 0 },
  { code: 'USD', decimals: 2 },
  { code: 'EUR', decimals: 2 },
  { code: 'KRW', decimals: 0 },
  { code: 'JPY', decimals: 0 },
  { code: 'CNY', decimals: 2 },
] as const;

export const NAV_GROUPS = [
  { key: 'overview', labelKey: 'navGroup.overview' },
  { key: 'operations', labelKey: 'navGroup.operations' },
  { key: 'commercial', labelKey: 'navGroup.commercial' },
  { key: 'finance', labelKey: 'navGroup.finance' },
  { key: 'people', labelKey: 'navGroup.people' },
  { key: 'intelligence', labelKey: 'navGroup.intelligence' },
  { key: 'system', labelKey: 'navGroup.system' },
] as const;
