import { auditLog, users } from '@dental/db-schema';
import { and, between, count, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditListQuery, AuditRecentItemDto } from './audit.schema.ts';

/**
 * Audit-log o'qish service (factory). RLS tenant orqali filtrlaydi (getDb(c)) —
 * query'da explicit `tenant_id` YOZILMAYDI. Faqat o'qish; yozish `audit-logger`'da.
 */
export const createAuditService = () => {
  async function list(c: Context, q: AuditListQuery) {
    const db = getDb(c);
    const offset = (q.page - 1) * q.pageSize;

    const filters = [];
    if (q.action) filters.push(eq(auditLog.action, q.action));
    if (q.resourceType) filters.push(eq(auditLog.resourceType, q.resourceType));
    if (q.userId) filters.push(eq(auditLog.userId, q.userId));
    if (q.from && q.to) {
      filters.push(
        between(
          auditLog.createdAt,
          new Date(`${q.from}T00:00:00+05:00`),
          new Date(`${q.to}T23:59:59.999+05:00`),
        ),
      );
    }
    const where = filters.length ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(q.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(auditLog).where(where),
    ]);

    return {
      data: rows,
      meta: { page: q.page, pageSize: q.pageSize, total: totalRows[0]?.total ?? 0 },
    };
  }

  /**
   * So'nggi `limit` ta audit yozuvini metadata-only (before/after YO'Q) qaytaradi.
   * `users` jadvaliga LEFT JOIN — actorName olish uchun.
   * RLS tenant-scope: getDb(c) orqali, explicit WHERE tenant_id YOZILMAYDI.
   * `users` platform-darajali (RLS tenant-scoped EMAS), lekin auditLog RLS orqali
   * faqat shu tenantning qatorlari qaytadi → cross-tenant user nomi chiqib ketmaydi.
   */
  async function recent(c: Context, limit = 15): Promise<AuditRecentItemDto[]> {
    const db = getDb(c);
    const rows = await db
      .select({
        id: auditLog.id,
        actorName: users.fullName,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      actorName: r.actorName ?? null,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  }

  return { list, recent };
};

export type AuditService = ReturnType<typeof createAuditService>;
