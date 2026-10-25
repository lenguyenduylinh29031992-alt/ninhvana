import { describe, expect, it } from 'vitest';
import {
  APPROVAL_THRESHOLDS,
  ORG_WIDE_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_MAP,
  hasOrgAccess,
  hasPermission,
  isOrgWideRole,
  permissionsForRoles,
  requiredApprovalRole,
  roleHasPermission,
  roleName,
} from './rbac';

describe('rbac catalogue', () => {
  it('defines every role with unique codes and at least one permission', () => {
    const codes = ROLES.map((role) => role.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const role of ROLES) {
      expect(role.permissions.length).toBeGreaterThan(0);
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('gives the chairman read-only visibility without operational writes', () => {
    const chairman = ROLE_MAP.CHAIRMAN!;
    expect(chairman.permissions).toContain(PERMISSIONS.FINANCE_VIEW);
    expect(chairman.permissions).toContain(PERMISSIONS.REPORT_ORG);
    expect(chairman.permissions).not.toContain(PERMISSIONS.EXPENSE_APPROVE);
    expect(chairman.permissions).not.toContain(PERMISSIONS.USER_MANAGE);
  });

  it('keeps front desk away from payroll and rate management', () => {
    expect(roleHasPermission('FRONT_DESK', PERMISSIONS.RESERVATION_CREATE)).toBe(true);
    expect(roleHasPermission('FRONT_DESK', PERMISSIONS.PAYROLL_VIEW)).toBe(false);
    expect(roleHasPermission('FRONT_DESK', PERMISSIONS.RATE_UPDATE)).toBe(false);
  });

  it('lets the CFO approve payroll and reopen the night audit', () => {
    expect(roleHasPermission('CFO', PERMISSIONS.PAYROLL_APPROVE)).toBe(true);
    expect(roleHasPermission('CFO', PERMISSIONS.NIGHT_AUDIT_REOPEN)).toBe(true);
    expect(roleHasPermission('CEO', PERMISSIONS.USER_MANAGE)).toBe(true);
    expect(roleHasPermission('CEO', PERMISSIONS.ROLE_MANAGE)).toBe(false);
  });

  it('contains no duplicate permissions inside a role', () => {
    for (const role of ROLES) {
      expect(new Set(role.permissions).size, role.code).toBe(role.permissions.length);
    }
  });
});

describe('scoping', () => {
  it('marks group roles as org-wide and property roles as scoped', () => {
    expect(isOrgWideRole('CEO')).toBe(true);
    expect(isOrgWideRole('FRONT_DESK')).toBe(false);
    expect(ORG_WIDE_ROLES.has('CFO')).toBe(true);
    expect(ORG_WIDE_ROLES.has('HOUSEKEEPING')).toBe(false);
  });

  it('derives org access from any org-wide role', () => {
    expect(hasOrgAccess(['FRONT_DESK', 'CFO'])).toBe(true);
    expect(hasOrgAccess(['FRONT_DESK', 'HOUSEKEEPING'])).toBe(false);
  });

  it('localizes role names', () => {
    expect(roleName('FRONT_DESK', 'vi')).toBe('Lễ tân');
    expect(roleName('FRONT_DESK', 'en')).toBe('Front Desk Agent');
    expect(roleName('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('permission checks', () => {
  const granted = permissionsForRoles(['FRONT_DESK']);

  it('requires all permissions for arrays by default', () => {
    expect(hasPermission(granted, [PERMISSIONS.FOLIO_POST, PERMISSIONS.FOLIO_SETTLE])).toBe(true);
    expect(hasPermission(granted, [PERMISSIONS.FOLIO_POST, PERMISSIONS.PAYROLL_VIEW])).toBe(false);
  });

  it('supports any-of checks', () => {
    expect(
      hasPermission(granted, [PERMISSIONS.PAYROLL_VIEW, PERMISSIONS.FOLIO_VIEW], 'any'),
    ).toBe(true);
    expect(hasPermission(granted, [], 'any')).toBe(true);
  });

  it('deduplicates permissions across multiple roles', () => {
    const merged = permissionsForRoles(['FRONT_DESK', 'CASHIER']);
    expect(merged.has(PERMISSIONS.CASH_SESSION)).toBe(true);
    expect([...merged].filter((p) => p === PERMISSIONS.FOLIO_VIEW)).toHaveLength(1);
  });
});

describe('approval thresholds', () => {
  it('routes amounts to the right authority', () => {
    expect(requiredApprovalRole(1_000_000)).toBe('PROPERTY_MANAGER');
    expect(requiredApprovalRole(APPROVAL_THRESHOLDS.PROPERTY_MANAGER)).toBe('CFO');
    expect(requiredApprovalRole(49_999_999)).toBe('CFO');
    expect(requiredApprovalRole(APPROVAL_THRESHOLDS.CFO)).toBe('CEO');
    expect(requiredApprovalRole(APPROVAL_THRESHOLDS.CEO)).toBe('CHAIRMAN');
  });
});
