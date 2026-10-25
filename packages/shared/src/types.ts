import type { PermissionCode } from './rbac';

export interface RoleAssignment {
  propertyId: string | null;
  roleCode: string;
}

export interface SessionProperty {
  id: string;
  code: string;
  name: string;
  type: 'HOTEL' | 'RESTAURANT' | 'SPA' | string;
  city: string;
  country: string;
  starRating: number | null;
  roomCount: number;
  currency: string;
  timezone: string;
  businessDayCutoff: number;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  orgId: string;
  locale: 'vi' | 'en';
  avatarUrl: string | null;
  orgWide: boolean;
  roles: RoleAssignment[];
  permissions: PermissionCode[] | string[];
  properties: SessionProperty[];
  lastLoginAt?: string | null;
  twoFactorEnabled?: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  orgId: string;
  email: string;
  name: string;
  orgWide: boolean;
  /** Compact role assignments: property id (null = org) + role code. */
  roles: Array<{ p: string | null; r: string }>;
  perms: string[];
  typ: 'access';
  iat?: number;
  exp?: number;
}

export interface MfaTokenPayload {
  sub: string;
  typ: 'mfa';
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  user: SessionUser;
  accessTokenExpiresAt: string;
  twoFactorRequired?: false;
}

export interface MfaChallenge {
  twoFactorRequired: true;
  mfaToken: string;
  expiresAt: string;
}

export interface LoginResponse {
  twoFactorRequired: boolean;
  mfaToken?: string;
  expiresAt?: string;
  user?: SessionUser;
  accessTokenExpiresAt?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp?: string;
  path?: string;
}

export interface HealthComponent {
  name: string;
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  detail?: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  components: HealthComponent[];
}

export interface PropertySummary {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string;
  country: string;
  starRating: number | null;
  roomCount: number;
  currency: string;
  timezone: string;
  businessDayCutoff: number;
  isActive: boolean;
  logoUrl: string | null;
}

export interface RecentActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
  propertyId: string | null;
  createdAt: string;
  reason: string | null;
}

export interface DashboardOverview {
  businessDate: string;
  generatedAt: string;
  property: PropertySummary | null;
  scope: 'property' | 'portfolio';
  metrics: {
    roomsAvailable: number;
    roomsSold: number;
    occupancy: number;
    revenueToday: number;
    revenueMonth: number;
    adr: number;
    revpar: number;
    inHouseGuests: number;
    arrivalsToday: number;
    departuresToday: number;
    staffOnDuty: number;
  };
  properties: Array<PropertySummary & { rooms: number; activeUsers: number }>;
  /** False until the first revenue-bearing transaction exists (Phase 1). */
  hasRevenueData: boolean;
  /** False until HR seed/import provides attendance data. */
  hasStaffData: boolean;
  activity: RecentActivityItem[];
  health: HealthStatus;
  pendingTasks: Array<{ key: string; label: string; count: number; href: string }>;
}

export interface SystemStats {
  properties: number;
  rooms: number;
  users: number;
  roles: number;
  auditEvents: number;
  currencies: number;
  taxRates: number;
  ratePlans: number;
  outlets: number;
}

export type SettingScope = 'ORG' | string;

export interface SettingRecord {
  id: string;
  scope: SettingScope;
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  updatedAt: string;
}

export interface TaxRateRecord {
  id: string;
  code: string;
  name: string;
  rate: string;
  type: 'VAT' | 'SERVICE_CHARGE' | 'LODGING' | 'WITHHOLDING' | 'OTHER';
  isIncluded: boolean;
  glAccountCode: string | null;
  isActive: boolean;
}

export interface ExchangeRateRecord {
  id: string;
  base: string;
  quote: string;
  rate: string;
  effectiveDate: string;
  source: string | null;
}

export interface AuditLogRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  propertyId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  hashSelf: string;
  createdAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  locale: string;
  avatarUrl: string | null;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{ id: string; propertyId: string | null; roleCode: string; propertyName: string | null }>;
}
