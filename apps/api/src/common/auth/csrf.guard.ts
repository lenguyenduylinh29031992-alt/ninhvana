import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { COOKIE_NAMES, ERROR_CODES, HEADERS, AppError } from '@grand-suite/shared';
import { CryptoService } from '../crypto/crypto.module';
import { IS_PUBLIC_KEY, type AuthenticatedRequest } from './auth.types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie-authenticated mutations:
 *  - double-submit token (`gs_csrf` cookie must equal `x-csrf-token` header)
 *  - Origin allow-list when the browser supplies one
 * Bearer-token clients are exempt because their credential is not ambient.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {
    const configured = (config.get<string>('ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    this.allowedOrigins = new Set([
      config.get<string>('PUBLIC_WEB_URL') ?? 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...configured,
    ]);
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const authorization = request.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return true;
    }

    const origin = request.headers.origin;
    if (origin && !this.allowedOrigins.has(origin)) {
      throw new AppError(ERROR_CODES.CSRF_INVALID, `Origin không được phép: ${origin}`, 403);
    }

    const cookieToken = request.cookies?.[COOKIE_NAMES.CSRF];
    const headerToken = request.headers[HEADERS.CSRF];
    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      !this.crypto.safeEqual(cookieToken, headerToken)
    ) {
      throw new AppError(ERROR_CODES.CSRF_INVALID, undefined, 403);
    }
    return true;
  }
}
