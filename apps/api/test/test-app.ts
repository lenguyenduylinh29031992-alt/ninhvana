import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { RequestContextMiddleware } from '../src/common/context/request-context';
import { AllExceptionsFilter } from '../src/common/http/all-exceptions.filter';

/**
 * Boots the real application (guards, filters, middleware) against the test
 * database. Integration suites use this instead of a mock HTTP layer so RBAC
 * and CSRF behaviour is exercised end to end.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser(process.env.COOKIE_SECRET ?? 'test-cookie-secret-at-least-32-characters'));
  const requestContext = new RequestContextMiddleware();
  app.use((request: Request, response: Response, next: NextFunction) => {
    requestContext.use(request, response, next);
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.useLogger(false);

  await app.init();
  return app;
}

/** Reads one cookie value from a `set-cookie` header array. */
export function readSetCookie(
  headers: Record<string, unknown>,
  name: string,
): string | undefined {
  const raw = headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  for (const cookie of list) {
    const [pair] = cookie.split(';');
    const [key, ...rest] = pair!.split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}
