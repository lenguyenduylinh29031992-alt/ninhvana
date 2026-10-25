import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, ERROR_MESSAGES_VI, AppError } from '@grand-suite/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { RequestContext } from '../context/request-context';

interface ProblemBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp: string;
  path: string;
}

/**
 * One error shape for the whole API: { statusCode, code, message, details, requestId }.
 * Never leaks stack traces or SQL to clients; 5xx are logged with full context.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestId = RequestContext.get()?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ERROR_CODES.INTERNAL;
    let message = ERROR_MESSAGES_VI[ERROR_CODES.INTERNAL]!;
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = ERROR_CODES.VALIDATION_ERROR;
      message = ERROR_MESSAGES_VI[ERROR_CODES.VALIDATION_ERROR]!;
      details = exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, code, message, details } = mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      code = ERROR_CODES.VALIDATION_ERROR;
      message = 'Dữ liệu gửi lên không đúng định dạng.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        code = typeof record.code === 'string' ? record.code : mapStatusToCode(status);
        message =
          typeof record.message === 'string'
            ? record.message
            : Array.isArray(record.message)
              ? record.message.join('; ')
              : (ERROR_MESSAGES_VI[code] ?? message);
        details = record.details;
      } else {
        code = mapStatusToCode(status);
      }
    } else if (exception instanceof Error && exception.message === ERROR_CODES.UNAUTHORIZED) {
      status = HttpStatus.UNAUTHORIZED;
      code = ERROR_CODES.UNAUTHORIZED;
      message = ERROR_MESSAGES_VI[ERROR_CODES.UNAUTHORIZED]!;
    } else if (isBodyParserError(exception)) {
      status = HttpStatus.BAD_REQUEST;
      code = ERROR_CODES.VALIDATION_ERROR;
      message = 'Nội dung yêu cầu không hợp lệ.';
    }

    const body: ProblemBody = {
      statusCode: status,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(requestId ? { requestId } : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${status} [${code}] ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    } else {
      this.logger.warn(`${request.method} ${request.originalUrl} → ${status} [${code}] ${message}`);
    }

    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }
}

function mapStatusToCode(status: number): string {
  if (status === 401) return ERROR_CODES.UNAUTHORIZED;
  if (status === 403) return ERROR_CODES.FORBIDDEN;
  if (status === 404) return ERROR_CODES.NOT_FOUND;
  if (status === 409) return ERROR_CODES.CONFLICT;
  if (status === 422) return ERROR_CODES.UNPROCESSABLE;
  if (status === 429) return ERROR_CODES.RATE_LIMITED;
  if (status >= 400 && status < 500) return ERROR_CODES.VALIDATION_ERROR;
  return ERROR_CODES.INTERNAL;
}

function mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
  status: number;
  code: string;
  message: string;
  details?: unknown;
} {
  switch (error.code) {
    case 'P2002':
      return {
        status: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Dữ liệu đã tồn tại (trùng khoá).',
        details: { fields: error.meta?.target },
      };
    case 'P2003':
    case 'P2014':
      return {
        status: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Không thể thực hiện vì dữ liệu liên quan đang được sử dụng.',
      };
    case 'P2025':
      return {
        status: 404,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Không tìm thấy bản ghi.',
      };
    case 'P2034':
      return {
        status: 409,
        code: ERROR_CODES.CONFLICT,
        message: 'Giao dịch xung đột, vui lòng thử lại.',
      };
    default:
      return {
        status: 500,
        code: ERROR_CODES.DATABASE_UNAVAILABLE,
        message: 'Không thể xử lý dữ liệu. Vui lòng thử lại.',
        details: { prismaCode: error.code },
      };
  }
}

function isBodyParserError(exception: unknown): boolean {
  return (
    exception instanceof SyntaxError &&
    'status' in exception &&
    (exception as SyntaxError & { status: number }).status === 400
  );
}
