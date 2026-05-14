import { auditLog } from '@dental/db-schema';
import type { Context } from 'hono';
import type { Database, DbOrTx } from '../db/client.ts';

/**
 * Audit log — har permission-protected mutation va sensitive read uchun.
 *
 * Sync, joriy transaction ichida yoziladi (compliance-grade — write va log atomik).
 * Drizzle middleware (M1.2) tomonidan `c.set('db', tx)` o'rnatiladi — shu tx ishlatamiz.
 *
 * Platform-level event'lar (login, password reset) — tenant_id NULL.
 * Bu RLS policy `audit_log_tenant_isolation_insert` da WITH CHECK orqali ruxsat etilgan.
 */

declare module 'hono' {
  interface ContextVariableMap {
    user?: { id: string };
    activeTenantId?: string | null;
    activeBranchId?: string | null;
    db?: DbOrTx; // RLS middleware o'rnatadi (transaction-bound yoki pool)
  }
}

export type AuditEntry = {
  /** Misol: 'created', 'updated', 'deleted', 'viewed', 'login', 'workspace_switched' */
  action: string;
  /** Misol: 'patient', 'appointment', 'auth', 'tenant_ownership' */
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Platform-level event uchun — tenant_id NULL bo'ladi */
  tenantIdOverride?: string | null;
};

const getClientIp = (c: Context): string | null => {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() ?? null;
  return c.req.header('x-real-ip') ?? null;
};

export const createAuditLogger = (deps: { db: Database }) => {
  const record = async (c: Context, entry: AuditEntry): Promise<void> => {
    const tx = c.get('db') ?? deps.db;

    const tenantId =
      entry.tenantIdOverride !== undefined
        ? entry.tenantIdOverride
        : (c.get('activeTenantId') ?? null);

    await tx.insert(auditLog).values({
      tenantId,
      userId: c.get('user')?.id ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      before: (entry.before as object | null) ?? null,
      after: (entry.after as object | null) ?? null,
      ip: getClientIp(c),
      userAgent: c.req.header('user-agent') ?? null,
    });
  };

  return { record };
};

export type AuditLogger = ReturnType<typeof createAuditLogger>;
