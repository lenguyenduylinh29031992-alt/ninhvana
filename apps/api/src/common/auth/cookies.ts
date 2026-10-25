import type { CanActivate, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { COOKIE_NAMES, ERROR_CODES, AppError } from '@grand-suite/shared';
import type { CookieOptions } from 'express';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from '@grand-suite/shared';

export type CookieKind = 'access' | 'refresh' | 'csrf';

export function cookieOptions(config: ConfigService, kind: CookieKind): CookieOptions {
  const base: CookieOptions = {
    secure: config.get<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
  };
  if (kind === 'access') {
    return {
      ...base,
      httpOnly: true,
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    };
  }
  if (kind === 'refresh') {
    return {
      ...base,
      httpOnly: true,
      // The refresh token is only ever sent to the auth endpoints.
      path: '/api/v1/auth',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    };
  }
  return {
    ...base,
    httpOnly: false, // readable by the browser for the double-submit header
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export const COOKIES = COOKIE_NAMES;

export function assertAccessTokenConfiguration(secret: string | undefined): string {
  if (!secret || secret.length < 32) {
    throw new AppError(ERROR_CODES.INTERNAL, 'JWT_ACCESS_SECRET chưa được cấu hình', 500);
  }
  return secret;
}

export type GuardClass = Type<CanActivate>;
