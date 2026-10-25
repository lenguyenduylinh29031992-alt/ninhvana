import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis is an accelerator, never a correctness dependency:
 * distributed locks fall back to PostgreSQL advisory locks when it is absent.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private connecting: Promise<void> | null = null;
  private lastFailureAt = 0;
  readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    this.configured = Boolean(config.get<string>('REDIS_URL'));
  }

  async onModuleInit(): Promise<void> {
    if (!this.configured) {
      this.logger.warn('REDIS_URL chưa cấu hình — dùng PostgreSQL cho khoá và cache');
      return;
    }
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    const url = this.config.get<string>('REDIS_URL');
    if (!url) return;
    this.connecting = (async () => {
      const client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 1500,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      });
      client.on('error', (error) => {
        this.lastFailureAt = Date.now();
        this.logger.warn(`Redis: ${error.message}`);
      });
      try {
        await client.connect();
        this.client = client;
        this.logger.log('Kết nối Redis thành công');
      } catch (error) {
        this.logger.warn(`Không kết nối được Redis: ${(error as Error).message}`);
        client.disconnect();
      } finally {
        this.connecting = null;
      }
    })();
    await this.connecting;
  }

  get isAvailable(): boolean {
    return Boolean(this.client && this.client.status === 'ready');
  }

  get raw(): Redis | null {
    return this.client;
  }

  async ping(): Promise<boolean> {
    if (!this.isAvailable) {
      // Retry at most every 30s to avoid latency on every health check.
      if (this.configured && Date.now() - this.lastFailureAt > 30_000) await this.connect();
    }
    if (!this.client || this.client.status !== 'ready') return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isAvailable || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable || !this.client) return;
    try {
      if (ttlSeconds) await this.client.set(key, value, 'EX', ttlSeconds);
      else await this.client.set(key, value);
    } catch {
      /* cache write is best-effort */
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isAvailable || !this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      /* ignore */
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => this.client?.disconnect());
      this.client = null;
    }
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
