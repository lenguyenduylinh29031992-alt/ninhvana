import { Injectable } from '@nestjs/common';
import type { HealthStatus } from '@grand-suite/shared';
import { PrismaService } from '../../common/prisma/prisma.module';
import { RedisService } from '../../common/redis/redis.module';

const startedAt = Date.now();
const APP_VERSION = process.env.APP_VERSION ?? '0.1.0';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthStatus> {
    const components: HealthStatus['components'] = [];

    let dbUp = false;
    try {
      const latency = await this.prisma.ping();
      dbUp = true;
      components.push({ name: 'postgres', status: 'up', latencyMs: latency });
    } catch (error) {
      components.push({
        name: 'postgres',
        status: 'down',
        detail: (error as Error).message,
      });
    }

    const redisUp = await this.redis.ping();
    components.push({
      name: 'redis',
      status: redisUp ? 'up' : this.redis.configured ? 'degraded' : 'up',
      detail: redisUp ? undefined : 'Không khả dụng — dùng khoá PostgreSQL dự phòng',
    });

    components.push({
      name: 'api',
      status: 'up',
      latencyMs: 0,
      detail: `uptime ${Math.floor((Date.now() - startedAt) / 1000)}s`,
    });

    const status: HealthStatus['status'] = !dbUp ? 'down' : redisUp ? 'ok' : 'degraded';

    return {
      status,
      version: APP_VERSION,
      environment: process.env.NODE_ENV ?? 'development',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      components,
    };
  }
}
