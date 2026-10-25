import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, AppError } from '@grand-suite/shared';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.module';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Distributed availability locks. Redis removes thundering-herd contention;
 * PostgreSQL advisory locks (used inside the reservation transaction) and the
 * exclusion constraint remain the correctness guarantees if Redis is absent.
 */
@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);

  constructor(private readonly redis: RedisService) {}

  async withLocks<T>(keys: string[], callback: () => Promise<T>, ttlMs = 8000): Promise<T> {
    if (!this.redis.isAvailable) return callback();

    const sorted = [...new Set(keys)].sort();
    const tokens: Array<{ key: string; token: string }> = [];
    const deadline = Date.now() + 4000;

    try {
      for (const key of sorted) {
        let acquired = false;
        while (!acquired) {
          const token = randomUUID();
          const result = await this.redis.raw!.set(key, token, 'PX', ttlMs, 'NX');
          if (result === 'OK') {
            tokens.push({ key, token });
            acquired = true;
          } else if (Date.now() > deadline) {
            throw new AppError(
              ERROR_CODES.CONFLICT,
              'Hệ thống đang xử lý giao dịch khác cho phòng này, vui lòng thử lại.',
              409,
            );
          } else {
            await new Promise((resolve) => setTimeout(resolve, 40 + Math.random() * 60));
          }
        }
      }
      return await callback();
    } finally {
      for (const { key, token } of tokens.reverse()) {
        try {
          await this.redis.raw!.eval(RELEASE_SCRIPT, 1, key, token);
        } catch {
          this.logger.warn(`Không giải phóng được khoá ${key}`);
        }
      }
    }
  }

  /** Serialises overlapping room-type/date writes inside a transaction. */
  async advisoryLocks(tx: Prisma.TransactionClient, keys: string[]): Promise<void> {
    for (const key of [...new Set(keys)].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    }
  }
}

@Global()
@Module({ providers: [LockService], exports: [LockService] })
export class LockModule {}
