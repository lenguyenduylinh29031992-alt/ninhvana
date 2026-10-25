import { ERROR_CODES } from '@grand-suite/shared';
import { AppError } from '@grand-suite/shared';
import { HEADERS, isOrgWideRole } from '@grand-suite/shared';
import { RequestContext } from '../context/request-context';
import type { AuthUser } from './auth.types';

/** Throws 403 unless the user can operate on the given property. */
export function assertPropertyAccess(user: AuthUser, propertyId: string): void {
  if (user.orgWide) return;
  const allowed = user.roles.some((role) => role.propertyId === propertyId);
  if (!allowed) {
    throw new AppError(ERROR_CODES.PROPERTY_FORBIDDEN, undefined, 403);
  }
}

export function accessiblePropertyIds(user: AuthUser): string[] {
  return [...new Set(user.roles.map((role) => role.propertyId).filter((id): id is string => Boolean(id)))];
}

/** The active property is a UI hint; it is validated, never trusted. */
export function readActivePropertyId(headers: Record<string, unknown>): string | null {
  const raw = headers[HEADERS.PROPERTY];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'ALL' || trimmed === 'all') return null;
  return trimmed.slice(0, 64);
}

export function describeRoles(user: AuthUser): string {
  return user.roles
    .map((role) => (role.propertyId ? `${role.roleCode}@${role.propertyId}` : role.roleCode))
    .join(',');
}

export function isGroupRole(roleCode: string): boolean {
  return isOrgWideRole(roleCode);
}

/** Attach the request context with the authenticated user id for log correlation. */
export function patchRequestContext(user: AuthUser): void {
  RequestContext.patch({ userEmail: user.email });
}
