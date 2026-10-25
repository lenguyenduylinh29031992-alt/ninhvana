import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { CryptoService } from '../crypto/crypto.module';
import { RequestContext } from '../context/request-context';
import { PrismaService } from '../prisma/prisma.module';

export interface AuditInput {
  orgId: string;
  propertyId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown> | null;
}

/**
 * Append-only audit trail with a per-organisation hash chain.
 * A row's hash covers the previous hash + a canonical payload, so deleting or
 * editing a record breaks verification of every subsequent row.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async record(input: AuditInput): Promise<AuditLog | null> {
    const ctx = RequestContext.get();
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialise writers per organisation so the chain cannot fork.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`audit:${input.orgId}`}))`;
        const previous = await tx.auditLog.findFirst({
          where: { orgId: input.orgId },
          orderBy: { createdAt: 'desc' },
          select: { hashSelf: true },
        });
        const createdAt = new Date();
        const canonical = {
          orgId: input.orgId,
          propertyId: input.propertyId ?? null,
          actorId: input.actorId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          reason: input.reason ?? null,
          // Normalise absent values to null so hashing is byte-identical to
          // verification (JSON columns return null, never undefined).
          before: toJson(input.before) ?? null,
          after: toJson(input.after) ?? null,
          metadata: toJson(input.metadata) ?? null,
          requestId: ctx?.requestId ?? null,
          createdAt: createdAt.toISOString(),
        };
        const hashSelf = this.crypto.sha256(
          `${previous?.hashSelf ?? 'genesis'}|${stableStringify(canonical)}`,
        );

        return tx.auditLog.create({
          data: {
            orgId: input.orgId,
            propertyId: input.propertyId ?? null,
            actorId: input.actorId ?? null,
            actorName: input.actorName ?? null,
            actorRole: input.actorRole ?? null,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            reason: input.reason ?? null,
            before: toJson(input.before) as Prisma.InputJsonValue | undefined,
            after: toJson(input.after) as Prisma.InputJsonValue | undefined,
            metadata: toJson(input.metadata) as Prisma.InputJsonValue | undefined,
            ip: ctx?.ip ?? null,
            userAgent: ctx?.userAgent ?? null,
            requestId: ctx?.requestId ?? null,
            hashPrev: previous?.hashSelf ?? null,
            hashSelf,
            createdAt,
          },
        });
      });
    } catch (error) {
      // Auditing must never break the business transaction, but it must be loud.
      this.logger.error(
        `Không ghi được audit log ${input.action}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return null;
    }
  }

  /** Recomputes the chain and reports the first broken link (admin tooling). */
  async verifyChain(orgId: string, limit = 2000): Promise<{ valid: boolean; checked: number; brokenAt?: string }> {
    const rows = await this.prisma.auditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        hashPrev: true,
        hashSelf: true,
        createdAt: true,
        propertyId: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
        before: true,
        after: true,
        metadata: true,
        requestId: true,
      },
    });
    let previous: string | null = null;
    for (const row of rows) {
      const canonical = {
        orgId,
        propertyId: row.propertyId,
        actorId: row.actorId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        reason: row.reason,
        before: row.before,
        after: row.after,
        metadata: row.metadata,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      };
      const expected = this.crypto.sha256(
        `${previous ?? 'genesis'}|${stableStringify(canonical)}`,
      );
      if (row.hashPrev !== previous || expected !== row.hashSelf) {
        return { valid: false, checked: rows.length, brokenAt: row.id };
      }
      previous = row.hashSelf;
    }
    return { valid: true, checked: rows.length };
  }
}

/**
 * Deterministic JSON for hashing: keys sorted recursively because PostgreSQL
 * `jsonb` does not preserve object key order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

/** JSON-safe projection (Date → ISO, Decimal → string, undefined dropped). */
export function toJson(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, inner) => {
        if (typeof inner === 'bigint') return inner.toString();
        return inner;
      }),
    );
  } catch {
    return { unserializable: true };
  }
}
