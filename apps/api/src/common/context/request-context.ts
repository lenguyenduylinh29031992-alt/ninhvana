import { Injectable, type NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContextData {
  requestId: string;
  ip?: string;
  userAgent?: string;
  userEmail?: string;
}


const storage = new AsyncLocalStorage<RequestContextData>();

export const RequestContext = {
  run: <T>(data: RequestContextData, callback: () => T): T => storage.run(data, callback),
  get: (): RequestContextData | undefined => storage.getStore(),
  patch: (values: Partial<RequestContextData>): void => {
    const current = storage.getStore();
    if (current) Object.assign(current, values);
  },
};

/**
 * Establishes a request id for logs/audit, honours an inbound X-Request-Id and
 * echoes it back so support can correlate a UI error with server logs.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const inbound = request.headers['x-request-id'];
    const requestId =
      typeof inbound === 'string' && inbound.length <= 100 ? inbound : randomUUID();
    response.setHeader('x-request-id', requestId);
    RequestContext.run(
      {
        requestId,
        ip: request.ip,
        userAgent: request.headers['user-agent']?.slice(0, 500),
      },
      next,
    );
  }
}
