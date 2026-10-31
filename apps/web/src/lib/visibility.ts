/**
 * Departments that do not own revenue: they must not see revenue navigation,
 * revenue KPIs or the 14-day revenue chart.
 */
const NON_REVENUE_DEPARTMENTS = new Set([
  'HOUSEKEEPING',
  'MAINTENANCE',
  'PROPERTY_OPS',
  'UTILITIES',
  'HR',
  'IT',
  'PURCHASING',
]);

export function canSeeRevenue(departmentCode?: string | null) {
  if (!departmentCode) return true; // leadership / unassigned executive users
  return !NON_REVENUE_DEPARTMENTS.has(departmentCode);
}
