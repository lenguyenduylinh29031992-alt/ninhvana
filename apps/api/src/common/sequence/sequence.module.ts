import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import { PrismaService } from '../prisma/prisma.module';

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Concurrency-safe document numbering. Increment happens inside the caller's
 * transaction with an atomic UPDATE ... RETURNING, so two parallel bookings can
 * never receive the same confirmation number.
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async next(tx: Tx, propertyId: string, docType: string): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ value: number; prefix: string; padding: number }>>`
      UPDATE "NumberSequence"
         SET "nextValue" = "nextValue" + 1,
             "updatedAt" = now()
       WHERE "propertyId" = ${propertyId} AND "docType" = ${docType}
      RETURNING ("nextValue" - 1) AS value, "prefix" AS prefix, "padding" AS padding
    `;
    const row = rows[0];
    if (!row) {
      throw new AppError(
        ERROR_CODES.INVALID_STATE,
        `Chưa cấu hình dãy số ${docType} cho cơ sở này`,
        500,
      );
    }
    return `${row.prefix}-${String(row.value).padStart(row.padding, '0')}`;
  }

  async nextPublic(propertyId: string, docType: string): Promise<string> {
    return this.prisma.$transaction((tx) => this.next(tx, propertyId, docType));
  }
}

@Global()
@Module({ providers: [SequenceService], exports: [SequenceService] })
export class SequenceModule {}
