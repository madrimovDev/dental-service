import { labOrders } from '@dental/db-schema';
import { and, count, desc, eq, lt, notInArray } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../lib/ownership.ts';
import type {
  CreateLabOrderInput,
  ListLabOrdersQuery,
  UpdateLabOrderInput,
} from './lab-orders.schema.ts';
import { assertLabOrderTransition, type LabOrderStatus } from './lab-orders.transitions.ts';

export const createLabOrdersService = (deps: {
  audit: AuditLogger;
  ownership?: OwnershipValidator;
}) => {
  const ownership = deps.ownership ?? createOwnershipValidator();
  /**
   * DS7: tenant-wide yoki patientId-filtered ro'yxat. RLS tenant bo'yicha filtrlaydi
   * (explicit WHERE tenant_id YO'Q). Pagination + ixtiyoriy status filtri; jami count alohida.
   */
  async function list(c: Context, query: ListLabOrdersQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.patientId) filters.push(eq(labOrders.patientId, query.patientId));
    if (query.status) filters.push(eq(labOrders.status, query.status));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [data, totalRows] = await Promise.all([
      db
        .select()
        .from(labOrders)
        .where(where)
        .orderBy(desc(labOrders.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(labOrders).where(where),
    ]);
    const total = totalRows[0]?.total ?? 0;

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: query.patientId ?? null,
      after: { patientId: query.patientId ?? null, count: data.length },
    });

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** Muddati o'tgan buyurtmalar (V3-5) — expectedDate < hozir, delivered/cancelled EMAS. */
  async function overdue(c: Context) {
    const db = getDb(c);
    const rows = await db
      .select()
      .from(labOrders)
      .where(
        and(
          lt(labOrders.expectedDate, new Date()),
          notInArray(labOrders.status, ['delivered', 'cancelled']),
        ),
      )
      .orderBy(labOrders.expectedDate);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'lab_order',
      resourceId: null,
      after: { overdue: true, count: rows.length },
    });
    return rows;
  }

  async function get(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(labOrders).where(eq(labOrders.id, id));
    if (row) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'lab_order',
        resourceId: id,
      });
    }
    return row ?? null;
  }

  async function create(c: Context, input: CreateLabOrderInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // L12 (audit 2026-07-06): cross-entity ownership — mavjud bo'lmagan/cross-tenant
    // patientId oldindan tekshiriladi (FK constraint xom 500 o'rniga toza 400,
    // visit-notes.service.ts CLI-421 pattern bilan bir xil — routes 400'ga aylantiradi).
    await ownership.assertPatientExists(c, input.patientId);

    const [row] = await db
      .insert(labOrders)
      .values({
        tenantId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        labName: input.labName,
        orderType: input.orderType,
        items: input.items,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        cost: input.cost !== undefined ? String(input.cost) : null,
        notes: input.notes ?? null,
      })
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'lab_order',
        resourceId: row.id,
        after: { patientId: input.patientId, orderType: input.orderType, lab: input.labName },
      });
    }
    return row;
  }

  async function update(c: Context, id: string, input: UpdateLabOrderInput) {
    const db = getDb(c);
    const [before] = await db.select().from(labOrders).where(eq(labOrders.id, id));
    if (!before) return null;

    // CLI-439 B2: status state-machine guard — istalgan status→status o'tish avval
    // ruxsat etilardi (`delivered→draft`, `cancelled→delivered`). Endi forward-only
    // chiziqli oqim (draft→sent→in_progress→ready→delivered) + `cancelled` istalgan
    // non-terminal holatdan. Orqaga qaytish BUTUNLAY bloklanadi — shu sabab sentDate/
    // deliveredDate'ni regressда tozalash kerak emas (regress yuz bermaydi).
    if (input.status && input.status !== before.status) {
      assertLabOrderTransition(before.status as LabOrderStatus, input.status as LabOrderStatus);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.labName) patch.labName = input.labName;
    if (input.orderType) patch.orderType = input.orderType;
    if (input.status) {
      patch.status = input.status;
      // Auto-set sentDate when transitioning to "sent"
      if (input.status === 'sent' && !before.sentDate) patch.sentDate = new Date();
      if (input.status === 'delivered' && !before.deliveredDate) patch.deliveredDate = new Date();
    }
    if (input.items) patch.items = input.items;
    if (input.sentDate !== undefined)
      patch.sentDate = input.sentDate ? new Date(input.sentDate) : null;
    if (input.expectedDate !== undefined)
      patch.expectedDate = input.expectedDate ? new Date(input.expectedDate) : null;
    if (input.deliveredDate !== undefined)
      patch.deliveredDate = input.deliveredDate ? new Date(input.deliveredDate) : null;
    if (input.cost !== undefined) patch.cost = input.cost === null ? null : String(input.cost);
    if (input.notes !== undefined) patch.notes = input.notes;

    const [row] = await db.update(labOrders).set(patch).where(eq(labOrders.id, id)).returning();
    if (row) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'lab_order',
        resourceId: id,
        before,
        after: row,
      });
    }
    return row;
  }

  return { list, get, create, update, overdue };
};

export type LabOrdersService = ReturnType<typeof createLabOrdersService>;
