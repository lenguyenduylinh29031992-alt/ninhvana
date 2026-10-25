import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { ERROR_CODES } from '@grand-suite/shared';
import type { ZodType } from 'zod';

/**
 * Zod-based request validation. Errors are returned in a flat, field-addressable
 * shape so the web app can highlight inputs without parsing prose.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
