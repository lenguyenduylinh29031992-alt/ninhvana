/** USALI department groups used as the financial dimension on ledger lines. */
export const DEPARTMENT_GROUPS = [
  'ROOMS',
  'FNB',
  'OTHER_OPERATED',
  'MISCELLANEOUS',
  'UNDISTRIBUTED',
  'ADMIN',
  'SALES',
  'PROPERTY_OPS',
  'UTILITIES',
  'MAINTENANCE',
  'FIXED',
] as const;

export type DepartmentGroup = (typeof DEPARTMENT_GROUPS)[number];

export const REVENUE_ACCOUNTS = {
  ROOMS: '1000',
  FOOD: '2000',
  BEVERAGE: '2100',
  EVENTS: '2200',
  SPA: '3000',
  RETAIL: '3100',
  OTHER: '3200',
} as const;

export const GL_FALLBACK_ACCOUNTS: Record<string, string> = {
  ROOMS: REVENUE_ACCOUNTS.ROOMS,
  FOOD: REVENUE_ACCOUNTS.FOOD,
  BEVERAGE: REVENUE_ACCOUNTS.BEVERAGE,
  SPA: REVENUE_ACCOUNTS.SPA,
  EVENTS: REVENUE_ACCOUNTS.EVENTS,
  RETAIL: REVENUE_ACCOUNTS.RETAIL,
  OTHER: REVENUE_ACCOUNTS.OTHER,
};

export function isDepartmentGroup(value: string): value is DepartmentGroup {
  return (DEPARTMENT_GROUPS as readonly string[]).includes(value);
}
