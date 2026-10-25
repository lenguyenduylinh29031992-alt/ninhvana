import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@grand-suite/shared';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, type AuthUser } from './auth.types';

/** Marks a route as reachable without an access token (login, health, docs). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

/** Requires every listed permission; a single string is the common case. */
export const Permissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Injects the authenticated user (or one of its fields).
 * Throws 401 rather than returning undefined so a mis-decorated public route
 * cannot leak "anonymous" objects.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, context: ExecutionContext): unknown => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      const error = new Error(ERROR_CODES.UNAUTHORIZED);
      (error as Error & { status: number }).status = 401;
      throw error;
    }
    return field ? user[field] : user;
  },
);
