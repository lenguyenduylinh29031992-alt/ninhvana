/**
 * Single source of truth for roles & permissions.
 * The API seeds RolePermission from this map; the web app hides navigation with
 * the same data, so a permission change cannot drift between backend and UI.
 */

export const PERMISSIONS = {
  // Overview & assistant
  DASHBOARD_VIEW: 'dashboard:view',
  ASSISTANT_USE: 'assistant:use',

  // Foundation
  PROPERTY_VIEW: 'property:view',
  PROPERTY_MANAGE: 'property:manage',
  USER_VIEW: 'user:view',
  USER_MANAGE: 'user:manage',
  ROLE_MANAGE: 'role:manage',
  AUDIT_VIEW: 'audit:view',
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',
  INTEGRATION_VIEW: 'integration:view',
  INTEGRATION_MANAGE: 'integration:manage',
  BACKUP_MANAGE: 'backup:manage',

  // Guests & reservations
  GUEST_VIEW: 'guest:view',
  GUEST_MANAGE: 'guest:manage',
  RESERVATION_VIEW: 'reservation:view',
  RESERVATION_CREATE: 'reservation:create',
  RESERVATION_UPDATE: 'reservation:update',
  RESERVATION_CANCEL: 'reservation:cancel',

  // Folio, payments, invoices
  FOLIO_VIEW: 'folio:view',
  FOLIO_POST: 'folio:post',
  FOLIO_VOID: 'folio:void',
  FOLIO_SETTLE: 'folio:settle',
  PAYMENT_MANAGE: 'payment:manage',
  PAYMENT_REFUND: 'payment:refund',
  INVOICE_VIEW: 'invoice:view',
  INVOICE_ISSUE: 'invoice:issue',
  INVOICE_VOID: 'invoice:void',
  CASH_SESSION: 'cash:session',

  // Rooms & housekeeping
  ROOM_VIEW: 'room:view',
  ROOM_MANAGE: 'room:manage',
  ROOM_STATUS: 'room:status',
  HOUSEKEEPING_VIEW: 'housekeeping:view',
  HOUSEKEEPING_ASSIGN: 'housekeeping:assign',
  HOUSEKEEPING_UPDATE: 'housekeeping:update',
  MAINTENANCE_VIEW: 'maintenance:view',
  MAINTENANCE_MANAGE: 'maintenance:manage',

  // POS / kitchen / events
  POS_VIEW: 'pos:view',
  POS_ORDER: 'pos:order',
  POS_VOID: 'pos:void',
  POS_DISCOUNT: 'pos:discount',
  POS_SETTLE: 'pos:settle',
  KDS_VIEW: 'kds:view',
  KDS_UPDATE: 'kds:update',
  BANQUET_VIEW: 'banquet:view',
  BANQUET_MANAGE: 'banquet:manage',

  // Revenue management & distribution
  RATE_VIEW: 'rate:view',
  RATE_UPDATE: 'rate:update',
  REVENUE_MANAGE: 'revenue:manage',
  FORECAST_VIEW: 'forecast:view',
  CHANNEL_VIEW: 'channel:view',
  CHANNEL_MANAGE: 'channel:manage',
  CHANNEL_SYNC: 'channel:sync',
  ARI_PUSH: 'ari:push',

  // Marketing, inbox, CRM
  INBOX_VIEW: 'inbox:view',
  INBOX_MANAGE: 'inbox:manage',
  MARKETING_VIEW: 'marketing:view',
  MARKETING_MANAGE: 'marketing:manage',
  CRM_VIEW: 'crm:view',
  CRM_MANAGE: 'crm:manage',
  CAMPAIGN_MANAGE: 'campaign:manage',
  REVIEW_VIEW: 'review:view',
  REVIEW_RESPOND: 'review:respond',

  // Night audit & finance
  NIGHT_AUDIT_VIEW: 'night-audit:view',
  NIGHT_AUDIT_RUN: 'night-audit:run',
  NIGHT_AUDIT_REOPEN: 'night-audit:reopen',
  EXPENSE_VIEW: 'expense:view',
  EXPENSE_CREATE: 'expense:create',
  EXPENSE_APPROVE: 'expense:approve',
  EXPENSE_PAY: 'expense:pay',
  PURCHASE_VIEW: 'purchase:view',
  PURCHASE_CREATE: 'purchase:create',
  PURCHASE_APPROVE: 'purchase:approve',
  PURCHASE_RECEIVE: 'purchase:receive',
  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_MANAGE: 'inventory:manage',
  INVENTORY_COUNT: 'inventory:count',
  BUDGET_VIEW: 'budget:view',
  BUDGET_MANAGE: 'budget:manage',
  FINANCE_VIEW: 'finance:view',
  FINANCE_MANAGE: 'finance:manage',
  FINANCE_CLOSE: 'finance:close',

  // People
  EMPLOYEE_VIEW: 'employee:view',
  EMPLOYEE_MANAGE: 'employee:manage',
  ROSTER_VIEW: 'roster:view',
  ROSTER_MANAGE: 'roster:manage',
  ATTENDANCE_VIEW: 'attendance:view',
  ATTENDANCE_MANAGE: 'attendance:manage',
  LEAVE_VIEW: 'leave:view',
  LEAVE_REQUEST: 'leave:request',
  LEAVE_APPROVE: 'leave:approve',
  PAYROLL_VIEW: 'payroll:view',
  PAYROLL_MANAGE: 'payroll:manage',
  PAYROLL_APPROVE: 'payroll:approve',
  RECRUIT_VIEW: 'recruit:view',
  RECRUIT_MANAGE: 'recruit:manage',

  // Reporting & approvals
  REPORT_VIEW: 'report:view',
  REPORT_ORG: 'report:view_org',
  REPORT_BUILD: 'report:build',
  REPORT_EXPORT: 'report:export',
  REPORT_SCHEDULE: 'report:schedule',
  APPROVAL_ACT: 'approval:act',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS) as PermissionCode[];

const VIEW_ONLY: PermissionCode[] = ALL_PERMISSIONS.filter((p) => p.endsWith(':view'));

function uniquePermissions(list: PermissionCode[]): PermissionCode[] {
  return [...new Set(list)];
}

export type RoleScope = 'ORG' | 'PROPERTY';

export interface RoleDefinition {
  code: string;
  name: string;
  nameEn: string;
  description: string;
  scope: RoleScope;
  /** Level 10 = board, 1 = operational. Used for sorted pickers. */
  level: number;
  permissions: PermissionCode[];
}

export const ROLES: RoleDefinition[] = [
  {
    code: 'SUPER_ADMIN',
    name: 'Quản trị hệ thống',
    nameEn: 'System Administrator',
    description: 'Toàn quyền cấu hình hệ thống, người dùng và tích hợp.',
    scope: 'ORG',
    level: 9,
    permissions: ALL_PERMISSIONS,
  },
  {
    code: 'CHAIRMAN',
    name: 'Chủ tịch',
    nameEn: 'Chairman',
    description: 'Xem toàn bộ báo cáo hợp nhất, tài chính và nhật ký.',
    scope: 'ORG',
    level: 10,
    permissions: uniquePermissions([
      ...VIEW_ONLY,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.REPORT_ORG,
      PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.ASSISTANT_USE,
      PERMISSIONS.BUDGET_VIEW,
      PERMISSIONS.PAYROLL_VIEW,
    ]),
  },
  {
    code: 'CEO',
    name: 'Tổng giám đốc',
    nameEn: 'Chief Executive Officer',
    description: 'Toàn quyền vận hành và tài chính, phê duyệt ngân sách và CAPEX.',
    scope: 'ORG',
    level: 9,
    permissions: ALL_PERMISSIONS.filter(
      (p) => p !== PERMISSIONS.ROLE_MANAGE && p !== PERMISSIONS.BACKUP_MANAGE,
    ),
  },
  {
    code: 'CFO',
    name: 'Kế toán trưởng',
    nameEn: 'Chief Financial Officer',
    description: 'Khoá sổ, thuế, lương, ngân sách, phê duyệt chi và kiểm toán.',
    scope: 'ORG',
    level: 8,
    permissions: uniquePermissions([
      ...VIEW_ONLY,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.EXPENSE_APPROVE,
      PERMISSIONS.EXPENSE_PAY,
      PERMISSIONS.PURCHASE_APPROVE,
      PERMISSIONS.BUDGET_MANAGE,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.FINANCE_CLOSE,
      PERMISSIONS.PAYROLL_APPROVE,
      PERMISSIONS.PAYROLL_MANAGE,
      PERMISSIONS.APPROVAL_ACT,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.REPORT_ORG,
      PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.REPORT_SCHEDULE,
      PERMISSIONS.ASSISTANT_USE,
      PERMISSIONS.NIGHT_AUDIT_REOPEN,
      PERMISSIONS.INVOICE_VOID,
      PERMISSIONS.PAYMENT_REFUND,
      PERMISSIONS.AUDIT_VIEW,
      PERMISSIONS.CHANNEL_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.PURCHASE_VIEW,
    ]),
  },
  {
    code: 'PROPERTY_MANAGER',
    name: 'Giám đốc khách sạn',
    nameEn: 'Property Manager',
    description: 'Điều hành một cơ sở, duyệt chi trong hạn mức, xem P&L cơ sở.',
    scope: 'PROPERTY',
    level: 7,
    permissions: uniquePermissions([
      ...VIEW_ONLY,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RESERVATION_CREATE,
      PERMISSIONS.RESERVATION_UPDATE,
      PERMISSIONS.RESERVATION_CANCEL,
      PERMISSIONS.FOLIO_POST,
      PERMISSIONS.FOLIO_VOID,
      PERMISSIONS.FOLIO_SETTLE,
      PERMISSIONS.PAYMENT_MANAGE,
      PERMISSIONS.PAYMENT_REFUND,
      PERMISSIONS.INVOICE_ISSUE,
      PERMISSIONS.ROOM_MANAGE,
      PERMISSIONS.ROOM_STATUS,
      PERMISSIONS.HOUSEKEEPING_ASSIGN,
      PERMISSIONS.HOUSEKEEPING_UPDATE,
      PERMISSIONS.MAINTENANCE_MANAGE,
      PERMISSIONS.POS_ORDER,
      PERMISSIONS.POS_VOID,
      PERMISSIONS.POS_DISCOUNT,
      PERMISSIONS.POS_SETTLE,
      PERMISSIONS.KDS_UPDATE,
      PERMISSIONS.BANQUET_MANAGE,
      PERMISSIONS.RATE_UPDATE,
      PERMISSIONS.REVENUE_MANAGE,
      PERMISSIONS.FORECAST_VIEW,
      PERMISSIONS.CHANNEL_SYNC,
      PERMISSIONS.CHANNEL_MANAGE,
      PERMISSIONS.INBOX_MANAGE,
      PERMISSIONS.MARKETING_VIEW,
      PERMISSIONS.CRM_MANAGE,
      PERMISSIONS.CAMPAIGN_MANAGE,
      PERMISSIONS.REVIEW_RESPOND,
      PERMISSIONS.NIGHT_AUDIT_RUN,
      PERMISSIONS.NIGHT_AUDIT_VIEW,
      PERMISSIONS.EXPENSE_CREATE,
      PERMISSIONS.EXPENSE_APPROVE,
      PERMISSIONS.EXPENSE_PAY,
      PERMISSIONS.PURCHASE_CREATE,
      PERMISSIONS.PURCHASE_APPROVE,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.INVENTORY_COUNT,
      PERMISSIONS.BUDGET_VIEW,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.EMPLOYEE_VIEW,
      PERMISSIONS.ROSTER_MANAGE,
      PERMISSIONS.ROSTER_VIEW,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.LEAVE_VIEW,
      PERMISSIONS.PAYROLL_VIEW,
      PERMISSIONS.APPROVAL_ACT,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.REPORT_SCHEDULE,
      PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.REPORT_BUILD,
      PERMISSIONS.ASSISTANT_USE,
      PERMISSIONS.USER_VIEW,
    ]),
  },
  {
    code: 'REVENUE_DIRECTOR',
    name: 'Giám đốc doanh thu',
    nameEn: 'Revenue Director',
    description: 'Chiến lược giá, hạn mức, kênh phân phối và dự báo nhu cầu.',
    scope: 'ORG',
    level: 7,
    permissions: uniquePermissions([
      ...VIEW_ONLY,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RATE_UPDATE,
      PERMISSIONS.REVENUE_MANAGE,
      PERMISSIONS.FORECAST_VIEW,
      PERMISSIONS.CHANNEL_MANAGE,
      PERMISSIONS.CHANNEL_SYNC,
      PERMISSIONS.ARI_PUSH,
      PERMISSIONS.RESERVATION_VIEW,
      PERMISSIONS.RESERVATION_CREATE,
      PERMISSIONS.RESERVATION_UPDATE,
      PERMISSIONS.RESERVATION_CANCEL,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.REPORT_ORG,
      PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.REPORT_BUILD,
      PERMISSIONS.ASSISTANT_USE,
      PERMISSIONS.MARKETING_VIEW,
      PERMISSIONS.INBOX_VIEW,
      PERMISSIONS.NIGHT_AUDIT_VIEW,
      PERMISSIONS.NIGHT_AUDIT_RUN,
    ]),
  },
  {
    code: 'FRONT_DESK',
    name: 'Lễ tân',
    nameEn: 'Front Desk Agent',
    description: 'Đặt phòng, check-in/out, folio, thanh toán và yêu cầu buồng phòng.',
    scope: 'PROPERTY',
    level: 3,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.RESERVATION_VIEW,
      PERMISSIONS.RESERVATION_CREATE,
      PERMISSIONS.RESERVATION_UPDATE,
      PERMISSIONS.RESERVATION_CANCEL,
      PERMISSIONS.GUEST_VIEW,
      PERMISSIONS.GUEST_MANAGE,
      PERMISSIONS.FOLIO_VIEW,
      PERMISSIONS.FOLIO_POST,
      PERMISSIONS.FOLIO_SETTLE,
      PERMISSIONS.PAYMENT_MANAGE,
      PERMISSIONS.INVOICE_VIEW,
      PERMISSIONS.INVOICE_ISSUE,
      PERMISSIONS.ROOM_VIEW,
      PERMISSIONS.ROOM_STATUS,
      PERMISSIONS.HOUSEKEEPING_VIEW,
      PERMISSIONS.MAINTENANCE_VIEW,
      PERMISSIONS.MAINTENANCE_MANAGE,
      PERMISSIONS.POS_VIEW,
      PERMISSIONS.POS_ORDER,
      PERMISSIONS.KDS_VIEW,
      PERMISSIONS.RATE_VIEW,
      PERMISSIONS.CASH_SESSION,
      PERMISSIONS.CHANNEL_VIEW,
      PERMISSIONS.INBOX_VIEW,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.CRM_VIEW,
      PERMISSIONS.REVIEW_VIEW,
      PERMISSIONS.PROPERTY_VIEW,
    ]),
  },
  {
    code: 'HOUSEKEEPING',
    name: 'Buồng phòng',
    nameEn: 'Housekeeping Attendant',
    description: 'Danh sách phòng cần dọn, checklist, minibar, báo hỏng và đồ thất lạc.',
    scope: 'PROPERTY',
    level: 1,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.HOUSEKEEPING_VIEW,
      PERMISSIONS.HOUSEKEEPING_UPDATE,
      PERMISSIONS.ROOM_VIEW,
      PERMISSIONS.ROOM_STATUS,
      PERMISSIONS.MAINTENANCE_VIEW,
      PERMISSIONS.MAINTENANCE_MANAGE,
      PERMISSIONS.RESERVATION_VIEW,
      PERMISSIONS.LEAVE_REQUEST,
      PERMISSIONS.LEAVE_VIEW,
      PERMISSIONS.ROSTER_VIEW,
      PERMISSIONS.ATTENDANCE_VIEW,
    ]),
  },
  {
    code: 'EXEC_CHEF',
    name: 'Bếp trưởng',
    nameEn: 'Executive Chef',
    description: 'Thực đơn, định lượng nguyên liệu, bếp, yêu cầu mua và kiểm kê.',
    scope: 'PROPERTY',
    level: 6,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.POS_VIEW,
      PERMISSIONS.POS_ORDER,
      PERMISSIONS.POS_VOID,
      PERMISSIONS.KDS_VIEW,
      PERMISSIONS.KDS_UPDATE,
      PERMISSIONS.BANQUET_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.INVENTORY_COUNT,
      PERMISSIONS.PURCHASE_VIEW,
      PERMISSIONS.PURCHASE_CREATE,
      PERMISSIONS.EXPENSE_CREATE,
      PERMISSIONS.EMPLOYEE_VIEW,
      PERMISSIONS.ROSTER_VIEW,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.LEAVE_REQUEST,
    ]),
  },
  {
    code: 'FNB_MANAGER',
    name: 'Quản lý nhà hàng',
    nameEn: 'F&B Manager',
    description: 'Vận hành nhà hàng/bar, bàn, thực đơn, order, KDS và tiệc.',
    scope: 'PROPERTY',
    level: 6,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.POS_VIEW,
      PERMISSIONS.POS_ORDER,
      PERMISSIONS.POS_VOID,
      PERMISSIONS.POS_DISCOUNT,
      PERMISSIONS.POS_SETTLE,
      PERMISSIONS.KDS_VIEW,
      PERMISSIONS.KDS_UPDATE,
      PERMISSIONS.BANQUET_VIEW,
      PERMISSIONS.BANQUET_MANAGE,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_COUNT,
      PERMISSIONS.PURCHASE_VIEW,
      PERMISSIONS.PURCHASE_CREATE,
      PERMISSIONS.EXPENSE_CREATE,
      PERMISSIONS.RESERVATION_VIEW,
      PERMISSIONS.INBOX_VIEW,
      PERMISSIONS.INBOX_MANAGE,
      PERMISSIONS.EMPLOYEE_VIEW,
      PERMISSIONS.ROSTER_MANAGE,
      PERMISSIONS.ROSTER_VIEW,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.ASSISTANT_USE,
    ]),
  },
  {
    code: 'CASHIER',
    name: 'Thu ngân',
    nameEn: 'Cashier',
    description: 'Thu tiền, ca quỹ, hoá đơn và quyết toán POS.',
    scope: 'PROPERTY',
    level: 2,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.POS_VIEW,
      PERMISSIONS.POS_SETTLE,
      PERMISSIONS.FOLIO_VIEW,
      PERMISSIONS.FOLIO_SETTLE,
      PERMISSIONS.PAYMENT_MANAGE,
      PERMISSIONS.INVOICE_VIEW,
      PERMISSIONS.INVOICE_ISSUE,
      PERMISSIONS.CASH_SESSION,
      PERMISSIONS.RESERVATION_VIEW,
      PERMISSIONS.ROOM_VIEW,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.CHANNEL_VIEW,
    ]),
  },
  {
    code: 'HR_MANAGER',
    name: 'Quản lý nhân sự',
    nameEn: 'HR Manager',
    description: 'Hồ sơ nhân viên, xếp ca, chấm công, nghỉ phép, tuyển dụng và lương.',
    scope: 'ORG',
    level: 6,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.EMPLOYEE_VIEW,
      PERMISSIONS.EMPLOYEE_MANAGE,
      PERMISSIONS.ROSTER_VIEW,
      PERMISSIONS.ROSTER_MANAGE,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.LEAVE_VIEW,
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.PAYROLL_VIEW,
      PERMISSIONS.PAYROLL_MANAGE,
      PERMISSIONS.RECRUIT_VIEW,
      PERMISSIONS.RECRUIT_MANAGE,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.ASSISTANT_USE,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.LEAVE_REQUEST,
      PERMISSIONS.APPROVAL_ACT,
    ]),
  },
  {
    code: 'WAREHOUSE',
    name: 'Quản lý kho',
    nameEn: 'Warehouse Manager',
    description: 'Nhập/xuất/chuyển/kiểm kê, yêu cầu mua và nhận hàng.',
    scope: 'PROPERTY',
    level: 3,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.INVENTORY_VIEW,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.INVENTORY_COUNT,
      PERMISSIONS.PURCHASE_VIEW,
      PERMISSIONS.PURCHASE_CREATE,
      PERMISSIONS.PURCHASE_RECEIVE,
      PERMISSIONS.EXPENSE_CREATE,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.EXPENSE_VIEW,
      PERMISSIONS.LEAVE_REQUEST,
    ]),
  },
  {
    code: 'MARKETING',
    name: 'Marketing & Sales',
    nameEn: 'Marketing & Sales',
    description: 'Hộp thư đa kênh, lead, chiến dịch, attribution và ROI.',
    scope: 'ORG',
    level: 5,
    permissions: uniquePermissions([
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.INBOX_VIEW,
      PERMISSIONS.INBOX_MANAGE,
      PERMISSIONS.MARKETING_VIEW,
      PERMISSIONS.MARKETING_MANAGE,
      PERMISSIONS.PROPERTY_VIEW,
      PERMISSIONS.CRM_VIEW,
      PERMISSIONS.CRM_MANAGE,
      PERMISSIONS.CAMPAIGN_MANAGE,
      PERMISSIONS.REVIEW_VIEW,
      PERMISSIONS.REVIEW_RESPOND,
      PERMISSIONS.RESERVATION_VIEW,
      PERMISSIONS.RESERVATION_CREATE,
      PERMISSIONS.RESERVATION_UPDATE,
      PERMISSIONS.GUEST_VIEW,
      PERMISSIONS.GUEST_MANAGE,
      PERMISSIONS.CHANNEL_VIEW,
      PERMISSIONS.RATE_VIEW,
      PERMISSIONS.REPORT_VIEW,
      PERMISSIONS.REPORT_ORG,
      PERMISSIONS.REPORT_EXPORT,
      PERMISSIONS.REPORT_BUILD,
      PERMISSIONS.ASSISTANT_USE,
      PERMISSIONS.EXPENSE_CREATE,
      PERMISSIONS.EXPENSE_VIEW,
    ]),
  },
];

export type RoleCode = (typeof ROLES)[number]['code'];

export const ROLE_CODES = ROLES.map((role) => role.code) as unknown as readonly [
  string,
  ...string[],
];

export const ROLE_MAP: Record<string, RoleDefinition> = Object.fromEntries(
  ROLES.map((role) => [role.code, role]),
);

export const ORG_WIDE_ROLES: ReadonlySet<string> = new Set(
  ROLES.filter((role) => role.scope === 'ORG').map((role) => role.code),
);

export const PROPERTY_SCOPED_ROLES: ReadonlySet<string> = new Set(
  ROLES.filter((role) => role.scope === 'PROPERTY').map((role) => role.code),
);

export function isRoleCode(value: string): value is RoleCode {
  return value in ROLE_MAP;
}

export function isOrgWideRole(roleCode: string): boolean {
  return ORG_WIDE_ROLES.has(roleCode);
}

export function roleName(roleCode: string, locale: 'vi' | 'en' = 'vi'): string {
  const role = ROLE_MAP[roleCode];
  if (!role) return roleCode;
  return locale === 'en' ? role.nameEn : role.name;
}

export function roleHasPermission(roleCode: string, permission: PermissionCode | string): boolean {
  const role = ROLE_MAP[roleCode];
  if (!role) return false;
  return role.permissions.includes(permission as PermissionCode);
}

export function permissionsForRoles(roleCodes: Iterable<string>): Set<PermissionCode> {
  const granted = new Set<PermissionCode>();
  for (const code of roleCodes) {
    for (const permission of ROLE_MAP[code]?.permissions ?? []) granted.add(permission);
  }
  return granted;
}

/**
 * Check a permission requirement. Arrays mean "every one of them" by default.
 * `mode: 'any'` is available for screens that accept several capabilities.
 */
export function hasPermission(
  granted: Iterable<string>,
  required: string | string[],
  mode: 'all' | 'any' = 'all',
): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  const list = Array.isArray(required) ? required : [required];
  if (list.length === 0) return true;
  return mode === 'any' ? list.some((p) => set.has(p)) : list.every((p) => set.has(p));
}

/** Org-wide access means the user can see consolidated figures across properties. */
export function hasOrgAccess(roleCodes: Iterable<string>): boolean {
  for (const code of roleCodes) if (ORG_WIDE_ROLES.has(code)) return true;
  return false;
}

/**
 * Approval authority by amount (VND). Mirrors docs/PLAN.md §5.
 * Returns the minimum role required to approve an expense/purchase of that size.
 */
export const APPROVAL_THRESHOLDS = {
  PROPERTY_MANAGER: 5_000_000,
  CFO: 50_000_000,
  CEO: 500_000_000,
} as const;

export type ApprovalRole = 'PROPERTY_MANAGER' | 'CFO' | 'CEO' | 'CHAIRMAN';

export function requiredApprovalRole(amountVnd: number): ApprovalRole {
  if (amountVnd < APPROVAL_THRESHOLDS.PROPERTY_MANAGER) return 'PROPERTY_MANAGER';
  if (amountVnd < APPROVAL_THRESHOLDS.CFO) return 'CFO';
  if (amountVnd < APPROVAL_THRESHOLDS.CEO) return 'CEO';
  return 'CHAIRMAN';
}

export const REFUND_APPROVAL_THRESHOLD_VND = 10_000_000;

/** Human readable permission groups for the role editor UI. */
export const PERMISSION_GROUPS: Array<{ key: string; label: string; labelEn: string; match: RegExp }> = [
  { key: 'overview', label: 'Tổng quan', labelEn: 'Overview', match: /^(dashboard|assistant):/ },
  { key: 'foundation', label: 'Nền tảng & quản trị', labelEn: 'Foundation', match: /^(property|user|role|audit|settings|integration|backup):/ },
  { key: 'guests', label: 'Khách & đặt phòng', labelEn: 'Guests & reservations', match: /^(guest|reservation):/ },
  { key: 'folio', label: 'Folio & thanh toán', labelEn: 'Folio & payments', match: /^(folio|payment|invoice|cash):/ },
  { key: 'rooms', label: 'Phòng & buồng phòng', labelEn: 'Rooms & housekeeping', match: /^(room|housekeeping|maintenance):/ },
  { key: 'pos', label: 'Nhà hàng & sự kiện', labelEn: 'F&B & events', match: /^(pos|kds|banquet):/ },
  { key: 'revenue', label: 'Doanh thu & kênh', labelEn: 'Revenue & channels', match: /^(rate|revenue|forecast|channel|ari):/ },
  { key: 'marketing', label: 'Marketing & CRM', labelEn: 'Marketing & CRM', match: /^(inbox|marketing|crm|campaign|review):/ },
  { key: 'finance', label: 'Tài chính & chi phí', labelEn: 'Finance & costs', match: /^(expense|purchase|inventory|budget|finance|night-audit|approval):/ },
  { key: 'people', label: 'Nhân sự', labelEn: 'People', match: /^(employee|roster|attendance|leave|payroll|recruit):/ },
  { key: 'reporting', label: 'Báo cáo', labelEn: 'Reporting', match: /^report:/ },
];
