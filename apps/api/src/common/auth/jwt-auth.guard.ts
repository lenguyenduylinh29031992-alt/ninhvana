import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { COOKIE_NAMES, ERROR_CODES, AppError } from '@grand-suite/shared';
import {
  IS_PUBLIC_KEY,
  type AccessPayload,
  type AuthUser,
  type AuthenticatedRequest,
} from './auth.types';
import { assertPropertyAccess, patchRequestContext, readActivePropertyId } from './property-access';


/**
 * Stateless access-token guard. Tokens are carried in an httpOnly cookie for the
 * web app and via `Authorization: Bearer` for API clients.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, undefined, 401);
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new AppError(ERROR_CODES.SESSION_EXPIRED, undefined, 401);
    }
    if (payload.typ !== 'access' || !payload.sub) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, undefined, 401);
    }

    const user: AuthUser = {
      id: payload.sub,
      sid: payload.sid,
      orgId: payload.orgId,
      email: payload.email,
      fullName: payload.name,
      orgWide: payload.orgWide,
      roles: payload.roles.map((role) => ({ propertyId: role.p, roleCode: role.r })),
      permissions: payload.perms,
    };
    request.user = user;
    patchRequestContext(user);

    const activeProperty = readActivePropertyId(request.headers);
    if (activeProperty) assertPropertyAccess(user, activeProperty);

    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7).trim();
    }
    const cookie = request.cookies?.[COOKIE_NAMES.ACCESS];
    return typeof cookie === 'string' && cookie.length > 0 ? cookie : null;
  }
}
