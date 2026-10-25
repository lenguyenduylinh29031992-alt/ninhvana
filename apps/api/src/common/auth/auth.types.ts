import type { RoleAssignment } from '@grand-suite/shared';
import type { Request } from 'express';

/** Identity attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  sid: string;
  orgId: string;
  email: string;
  fullName: string;
  orgWide: boolean;
  roles: RoleAssignment[];
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export const IS_PUBLIC_KEY = 'gs:isPublic';
export const PERMISSIONS_KEY = 'gs:permissions';

export interface AccessPayload {
  sub: string;
  sid: string;
  orgId: string;
  email: string;
  name: string;
  orgWide: boolean;
  roles: Array<{ p: string | null; r: string }>;
  perms: string[];
  typ: 'access';
}

export interface RefreshPayload {
  sub: string;
  sid: string;
  jti: string;
  typ: 'refresh';
}

export interface MfaPayload {
  sub: string;
  typ: 'mfa';
}
