import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, AppError, hasPermission } from '@grand-suite/shared';
import { PERMISSIONS_KEY, type AuthenticatedRequest } from './auth.types';

/** Enforces the `@Permissions(...)` contract from packages/shared/src/rbac.ts. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) throw new AppError(ERROR_CODES.UNAUTHORIZED, undefined, 401);

    if (!hasPermission(user.permissions, required)) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        `Bạn cần quyền: ${required.join(', ')}`,
        403,
      );
    }
    return true;
  }
}
