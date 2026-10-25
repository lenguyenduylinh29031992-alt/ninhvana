import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma connection with explicit lifecycle. The API fails fast on boot if the
 * database is unreachable; health endpoints report it afterwards.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Date columns are compared as timestamps by PostgreSQL. Pin the session
    // timezone to UTC so a @db.Date maps to 00:00Z and day filters never shift
    // by the host timezone (Asia/Ho_Chi_Minh is UTC+7).
    const url = process.env.DATABASE_URL ?? '';
    const separator = url.includes('?') ? '&' : '?';
    const datasourceUrl = /[?&]options=/.test(url)
      ? url
      : `${url}${separator}options=-c%20timezone%3DUTC`;
    super({
      datasources: { db: { url: datasourceUrl } },
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Kết nối PostgreSQL thành công');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap liveness probe used by /health. */
  async ping(): Promise<number> {
    const started = Date.now();
    await this.$queryRaw`SELECT 1`;
    return Date.now() - started;
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
